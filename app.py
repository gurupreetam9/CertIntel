
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
from pymongo import MongoClient, DESCENDING
from gridfs import GridFS
from dotenv import load_dotenv
from datetime import datetime
import json

# --- Initial Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
app_logger = logging.getLogger(__name__)
app_logger.info("Flask app.py: Script execution started.")

load_dotenv()
app_logger.info(f"Flask app.py: .env loaded: {'Yes' if os.getenv('MONGODB_URI') else 'No (or MONGODB_URI not set)'}")

from certificate_processor import extract_and_recommend_courses_from_image_data

app = Flask(__name__)
CORS(app)
app_logger.info("Flask app instance created.")

# --- MongoDB Setup ---
MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB_NAME", "imageverse_db")

if not MONGODB_URI:
    app.logger.critical("MONGODB_URI is not set. Please set it in your .env file or environment variables.")

mongo_client = None
db = None
fs_images = None 
user_course_processing_collection = None 

try:
    if MONGODB_URI:
        app.logger.info(f"Attempting to connect to MongoDB with URI (first part): {MONGODB_URI.split('@')[0] if '@' in MONGODB_URI else 'URI_FORMAT_UNEXPECTED'}")
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) 
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs_images = GridFS(db, collection="images") 
        user_course_processing_collection = db["user_course_processing_results"]
        app.logger.info(f"Successfully connected to MongoDB: {DB_NAME}, GridFS bucket 'images', and collection 'user_course_processing_results'.")
    else:
        app.logger.warning("MONGODB_URI not found, MongoDB connection will not be established.")
except Exception as e:
    app.logger.error(f"Failed to connect to MongoDB or initialize collections: {e}")
    mongo_client = None 
    db = None
    fs_images = None
    user_course_processing_collection = None

POPPLER_PATH = os.getenv("POPPLER_PATH", None)
if POPPLER_PATH: app_logger.info(f"Flask app.py: POPPLER_PATH found: {POPPLER_PATH}")
else: app_logger.info("Flask app.py: POPPLER_PATH not set.")


@app.route('/', methods=['GET'])
def health_check():
    app_logger.info("Flask /: Health check endpoint hit.")
    return jsonify({"status": "Flask server is running", "message": "Welcome to ImageVerse Flask API!"}), 200


@app.route('/api/process-certificates', methods=['POST'])
def process_certificates_from_db():
    req_id_cert = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/process-certificates (Req ID: {req_id_cert}): Received request.")
    
    if mongo_client is None or db is None or fs_images is None or user_course_processing_collection is None:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): MongoDB connection or required collection not available.")
        return jsonify({"error": "Database connection or required collection is not available."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    processing_mode = data.get("mode", "ocr_only") # 'ocr_only' or 'suggestions_only'
    
    # For 'ocr_only' mode
    additional_manual_courses_general = data.get("additionalManualCourses", []) # General manual courses from textarea

    # For 'suggestions_only' mode
    known_course_names_from_frontend = data.get("knownCourseNames", []) # All resolved names for suggestion phase
                                                                       # This list already includes OCR'd, manually named for failures, and general manual.

    if not user_id:
        app_logger.warning(f"Flask (Req ID: {req_id_cert}): User ID not provided.")
        return jsonify({"error": "User ID (userId) not provided"}), 400

    app_logger.info(f"Flask (Req ID: {req_id_cert}): Processing for userId: {user_id}, Mode: {processing_mode}.")
    app_logger.info(f"Flask (Req ID: {req_id_cert}): General Manual Courses: {additional_manual_courses_general}")
    app_logger.info(f"Flask (Req ID: {req_id_cert}): Known Course Names for Suggestions: {known_course_names_from_frontend}")


    try:
        image_data_for_processing = []
        if processing_mode == 'ocr_only': # Fetch images only if we need to OCR them
            user_image_files_cursor = db.images.files.find({"metadata.userId": user_id})
            for file_doc in user_image_files_cursor:
                file_id = file_doc["_id"]
                original_filename = file_doc.get("metadata", {}).get("originalName", file_doc["filename"])
                content_type = file_doc.get("contentType", "application/octet-stream") 
                
                app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Fetching file: ID={file_id}, Name={original_filename}")
                grid_out = fs_images.get(file_id)
                image_bytes = grid_out.read()
                grid_out.close()
                
                effective_content_type = file_doc.get("metadata", {}).get("sourceContentType", content_type)
                if file_doc.get("metadata", {}).get("convertedTo"): 
                     effective_content_type = file_doc.get("metadata", {}).get("convertedTo")

                image_data_for_processing.append({
                    "bytes": image_bytes, "original_filename": original_filename, 
                    "content_type": effective_content_type, "file_id": str(file_id) 
                })
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Found {len(image_data_for_processing)} images for OCR.")

        # --- Call the main processing function based on mode ---
        processing_result_dict = {}
        latest_previous_user_data_list = [] # For caching in suggestions_only mode

        if processing_mode == 'ocr_only':
            if not image_data_for_processing and not additional_manual_courses_general:
                 app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): No images and no general manual courses. Returning empty handed.")
                 return jsonify({
                    "successfully_extracted_courses": [],
                    "failed_extraction_images": [],
                    "processed_image_file_ids": [],
                    "message": "No certificate images found in DB and no manual courses provided for OCR."
                 }), 200
            
            processing_result_dict = extract_and_recommend_courses_from_image_data(
                image_data_list=image_data_for_processing,
                mode='ocr_only',
                additional_manual_courses=additional_manual_courses_general
            )
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): OCR processing complete.")
            # No DB storage in this phase

        elif processing_mode == 'suggestions_only':
            if not known_course_names_from_frontend: # This list should already include general manual courses
                return jsonify({"user_processed_data": [], "llm_error_summary": "No course names provided for suggestion generation."}), 200

            # Fetch latest *structured* processing result for this user to use as cache
            try:
                latest_doc = user_course_processing_collection.find_one(
                    {"userId": user_id},
                    sort=[("processedAt", DESCENDING)],
                    projection={"user_processed_data": 1, "processed_image_file_ids": 1} 
                )
                if latest_doc and "user_processed_data" in latest_doc:
                    latest_previous_user_data_list = latest_doc["user_processed_data"]
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Fetched 'user_processed_data' from latest record for cache.")
                else:
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): No previous processed data found for cache.")
            except Exception as e:
                app_logger.error(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Error fetching latest processed data: {e}")

            processing_result_dict = extract_and_recommend_courses_from_image_data(
                mode='suggestions_only',
                known_course_names=known_course_names_from_frontend,
                previous_user_data_list=latest_previous_user_data_list
            )
            app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Suggestion processing complete.")

            # --- Store results in MongoDB for 'suggestions_only' mode ---
            current_processed_data_for_db = processing_result_dict.get("user_processed_data", [])
            should_store_new_result = True # Default to store

            if latest_previous_user_data_list: # Compare if previous data exists
                # Simplified comparison: if the set of identified course names is the same,
                # and the number of suggestions per course is roughly similar, consider it "same enough" to skip storage.
                # This avoids overly complex deep dict comparison for now.
                prev_course_names = set(item['identified_course_name'] for item in latest_previous_user_data_list)
                curr_course_names = set(item['identified_course_name'] for item in current_processed_data_for_db)
                
                if prev_course_names == curr_course_names:
                    # Basic check on suggestion counts if names match
                    # This is a heuristic, can be made more robust
                    prev_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in latest_previous_user_data_list)
                    curr_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in current_processed_data_for_db)
                    if abs(prev_sug_counts - curr_sug_counts) <= len(curr_course_names): # Allow some minor diff
                        should_store_new_result = False
                        app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): New processing result seems similar to latest. Skipping storage.")
            
            if should_store_new_result and current_processed_data_for_db:
                try:
                    # Get all image file IDs associated with this user, to log them with the processed result
                    # This makes the stored record self-contained regarding which images were involved overall.
                    user_all_image_ids = [str(doc["_id"]) for doc in db.images.files.find({"metadata.userId": user_id}, projection={"_id": 1})]

                    data_to_store_in_db = {
                        "userId": user_id,
                        "processedAt": datetime.utcnow(),
                        "user_processed_data": current_processed_data_for_db,
                        "associated_image_file_ids": user_all_image_ids, # All user images at time of this processing
                        "llm_error_summary_at_processing": processing_result_dict.get("llm_error_summary")
                    }
                    insert_result = user_course_processing_collection.insert_one(data_to_store_in_db)
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Stored new structured processing result. Inserted ID: {insert_result.inserted_id}")
                except Exception as e:
                    app_logger.error(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Error storing new structured result: {e}")
        else:
            app_logger.error(f"Flask (Req ID: {req_id_cert}): Invalid processing_mode '{processing_mode}'.")
            return jsonify({"error": f"Invalid processing mode: {processing_mode}"}), 400
        
        return jsonify(processing_result_dict)

    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


if __name__ == '__main__':
    app.logger.info("Flask application starting with __name__ == '__main__'")
    app_logger.info(f"Effective MONGODB_URI configured: {'Yes' if MONGODB_URI else 'No'}")
    app_logger.info(f"Effective MONGODB_DB_NAME: {DB_NAME}")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT