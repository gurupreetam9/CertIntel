
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
from pymongo import MongoClient, DESCENDING, UpdateOne
from gridfs import GridFS
from dotenv import load_dotenv
from datetime import datetime, timezone
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
manual_course_names_collection = None

try:
    if MONGODB_URI:
        app.logger.info(f"Attempting to connect to MongoDB with URI (first part): {MONGODB_URI.split('@')[0] if '@' in MONGODB_URI else 'URI_FORMAT_UNEXPECTED'}")
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) 
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs_images = GridFS(db, collection="images") 
        user_course_processing_collection = db["user_course_processing_results"]
        manual_course_names_collection = db["manual_course_names"]
        # Create unique index for manual_course_names if it doesn't exist
        manual_course_names_collection.create_index([("userId", 1), ("fileId", 1)], unique=True, background=True)
        app.logger.info(f"Successfully connected to MongoDB: {DB_NAME}, GridFS bucket 'images', collection 'user_course_processing_results', and collection 'manual_course_names'.")
    else:
        app.logger.warning("MONGODB_URI not found, MongoDB connection will not be established.")
except Exception as e:
    app.logger.error(f"Failed to connect to MongoDB or initialize collections: {e}")
    mongo_client = None 
    db = None
    fs_images = None
    user_course_processing_collection = None
    manual_course_names_collection = None

POPPLER_PATH = os.getenv("POPPLER_PATH", None)
if POPPLER_PATH: app_logger.info(f"Flask app.py: POPPLER_PATH found: {POPPLER_PATH}")
else: app_logger.info("Flask app.py: POPPLER_PATH not set.")


@app.route('/', methods=['GET'])
def health_check():
    app_logger.info("Flask /: Health check endpoint hit.")
    return jsonify({"status": "Flask server is running", "message": "Welcome to ImageVerse Flask API!"}), 200

@app.route('/api/manual-course-name', methods=['POST'])
def save_manual_course_name():
    req_id_manual_name = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/manual-course-name (Req ID: {req_id_manual_name}): Received request.")

    if mongo_client is None or db is None or manual_course_names_collection is None:
        app_logger.error(f"Flask (Req ID: {req_id_manual_name}): MongoDB connection or 'manual_course_names' collection not available.")
        return jsonify({"error": "Database connection or required collection is not available."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    file_id = data.get("fileId")
    course_name = data.get("courseName")

    if not all([user_id, file_id, course_name]):
        app_logger.warning(f"Flask (Req ID: {req_id_manual_name}): Missing userId, fileId, or courseName.")
        return jsonify({"error": "Missing userId, fileId, or courseName"}), 400

    app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Saving manual name for userId: {user_id}, fileId: {file_id}, courseName: '{course_name}'")

    try:
        update_result = manual_course_names_collection.update_one(
            {"userId": user_id, "fileId": file_id},
            {
                "$set": {
                    "courseName": course_name,
                    "updatedAt": datetime.now(timezone.utc)
                },
                "$setOnInsert": {"createdAt": datetime.now(timezone.utc)}
            },
            upsert=True
        )
        if update_result.upserted_id:
            app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Inserted new manual course name. ID: {update_result.upserted_id}")
        elif update_result.modified_count > 0:
            app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Updated existing manual course name.")
        else:
             app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Manual course name was already up-to-date (no change). Matched: {update_result.matched_count}")
        
        return jsonify({"success": True, "message": "Manual course name saved."}), 200
    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_manual_name}): Error saving manual course name for userId {user_id}, fileId {file_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


@app.route('/api/process-certificates', methods=['POST'])
def process_certificates_from_db():
    req_id_cert = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/process-certificates (Req ID: {req_id_cert}): Received request.")
    
    required_collections = [mongo_client, db, fs_images, user_course_processing_collection, manual_course_names_collection]
    if not all(required_collections):
        app_logger.error(f"Flask (Req ID: {req_id_cert}): MongoDB connection or one of the required collections not available.")
        return jsonify({"error": "Database connection or required collection is not available."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    processing_mode = data.get("mode", "ocr_only") 
    additional_manual_courses_general = data.get("additionalManualCourses", []) 
    known_course_names_from_frontend = data.get("knownCourseNames", [])

    if not user_id:
        app_logger.warning(f"Flask (Req ID: {req_id_cert}): User ID not provided.")
        return jsonify({"error": "User ID (userId) not provided"}), 400

    app_logger.info(f"Flask (Req ID: {req_id_cert}): Processing for userId: {user_id}, Mode: {processing_mode}.")
    app_logger.info(f"Flask (Req ID: {req_id_cert}): General Manual Courses: {additional_manual_courses_general}")
    app_logger.info(f"Flask (Req ID: {req_id_cert}): Known Course Names for Suggestions: {known_course_names_from_frontend}")


    try:
        processing_result_dict = {}
        latest_previous_user_data_list = [] 

        if processing_mode == 'ocr_only':
            image_data_for_ocr_processing = []
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

                image_data_for_ocr_processing.append({
                    "bytes": image_bytes, "original_filename": original_filename, 
                    "content_type": effective_content_type, "file_id": str(file_id) 
                })
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Found {len(image_data_for_ocr_processing)} images for OCR attempt.")
            
            if not image_data_for_ocr_processing and not additional_manual_courses_general:
                 app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): No images and no general manual courses. Returning empty handed.")
                 return jsonify({
                    "successfully_extracted_courses": [],
                    "failed_extraction_images": [],
                    "processed_image_file_ids": []
                 }), 200
            
            ocr_phase_raw_results = extract_and_recommend_courses_from_image_data(
                image_data_list=image_data_for_ocr_processing,
                mode='ocr_only',
                additional_manual_courses=additional_manual_courses_general # Pass general ones here too
            )
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Initial OCR processing by certificate_processor complete.")

            # --- Apply stored manual names ---
            current_successful_courses = ocr_phase_raw_results.get("successfully_extracted_courses", [])
            initial_failed_images = ocr_phase_raw_results.get("failed_extraction_images", [])
            final_failed_images_for_frontend = []

            if initial_failed_images:
                app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): {len(initial_failed_images)} images failed initial OCR. Checking for stored manual names.")
                stored_manual_names_cursor = manual_course_names_collection.find({"userId": user_id})
                stored_manual_names_map = {item["fileId"]: item["courseName"] for item in stored_manual_names_cursor}
                app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Found {len(stored_manual_names_map)} stored manual names for user {user_id}.")

                for failed_img_info in initial_failed_images:
                    file_id_of_failed_img = failed_img_info.get("file_id")
                    if file_id_of_failed_img in stored_manual_names_map:
                        stored_name = stored_manual_names_map[file_id_of_failed_img]
                        app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Found stored manual name '{stored_name}' for failed image fileId {file_id_of_failed_img}. Adding to successful courses.")
                        if stored_name not in current_successful_courses:
                            current_successful_courses.append(stored_name)
                        # This image is no longer considered "failed" for frontend prompting
                    else:
                        # No stored name, so it's a true failure for frontend prompting
                        final_failed_images_for_frontend.append(failed_img_info)
                
                ocr_phase_raw_results["successfully_extracted_courses"] = sorted(list(set(current_successful_courses)))
                ocr_phase_raw_results["failed_extraction_images"] = final_failed_images_for_frontend
                app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): After applying stored names - Successful: {len(current_successful_courses)}, Failures to prompt: {len(final_failed_images_for_frontend)}.")
            else:
                 app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): No images initially failed OCR. No need to check stored manual names.")
                 # Ensure general manual courses are still included if no image processing happened
                 ocr_phase_raw_results["successfully_extracted_courses"] = sorted(list(set(current_successful_courses)))


            processing_result_dict = ocr_phase_raw_results
            # No DB storage of full results in this phase

        elif processing_mode == 'suggestions_only':
            if not known_course_names_from_frontend: 
                return jsonify({"user_processed_data": [], "llm_error_summary": "No course names provided for suggestion generation."}), 200

            try:
                latest_doc = user_course_processing_collection.find_one(
                    {"userId": user_id},
                    sort=[("processedAt", DESCENDING)],
                    projection={"user_processed_data": 1} 
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

            current_processed_data_for_db = processing_result_dict.get("user_processed_data", [])
            should_store_new_result = True 

            if latest_previous_user_data_list:
                prev_course_names = set(item['identified_course_name'] for item in latest_previous_user_data_list)
                curr_course_names = set(item['identified_course_name'] for item in current_processed_data_for_db)
                
                if prev_course_names == curr_course_names:
                    prev_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in latest_previous_user_data_list)
                    curr_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in current_processed_data_for_db)
                    if abs(prev_sug_counts - curr_sug_counts) <= len(curr_course_names): 
                        should_store_new_result = False
                        app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): New processing result seems similar to latest. Skipping storage.")
            
            if should_store_new_result and current_processed_data_for_db:
                try:
                    user_all_image_ids_associated_with_suggestions = [str(doc["_id"]) for doc in db.images.files.find({"metadata.userId": user_id}, projection={"_id": 1})]

                    data_to_store_in_db = {
                        "userId": user_id,
                        "processedAt": datetime.now(timezone.utc),
                        "user_processed_data": current_processed_data_for_db,
                        "associated_image_file_ids": user_all_image_ids_associated_with_suggestions, 
                        "llm_error_summary_at_processing": processing_result_dict.get("llm_error_summary")
                    }
                    insert_result = user_course_processing_collection.insert_one(data_to_store_in_db)
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Stored new structured processing result. Inserted ID: {insert_result.inserted_id}")
                except Exception as e:
                    app_logger.error(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Error storing new structured result: {e}")
            
            # Also pass back the image IDs associated with *this* suggestion run if the processor provides them (or all if not)
            processing_result_dict["associated_image_file_ids"] = processing_result_dict.get("associated_image_file_ids", user_all_image_ids_associated_with_suggestions if 'user_all_image_ids_associated_with_suggestions' in locals() else [])

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
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)


    