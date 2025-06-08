
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
# This collection will store the new structured output per user processing request
user_course_processing_collection = None 

try:
    if MONGODB_URI:
        app.logger.info(f"Attempting to connect to MongoDB with URI (first part): {MONGODB_URI.split('@')[0] if '@' in MONGODB_URI else 'URI_FORMAT_UNEXPECTED'}")
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) 
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs_images = GridFS(db, collection="images") 
        user_course_processing_collection = db["user_course_processing_results"] # New collection name
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
if POPPLER_PATH:
    app_logger.info(f"Flask app.py: POPPLER_PATH environment variable found: {POPPLER_PATH}")
else:
    app_logger.info("Flask app.py: POPPLER_PATH environment variable not set (not critical for current app.py features).")


@app.route('/', methods=['GET'])
def health_check():
    app_logger.info("Flask /: Health check endpoint hit.")
    return jsonify({"status": "Flask server is running", "message": "Welcome to ImageVerse Flask API!"}), 200


@app.route('/api/process-certificates', methods=['POST'])
def process_certificates_from_db():
    req_id_cert = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/process-certificates (Req ID: {req_id_cert}): Received request.")
    if mongo_client is None or db is None or fs_images is None or user_course_processing_collection is None:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): MongoDB connection or user_course_processing_collection not available.")
        return jsonify({"error": "Database connection or required collection is not available. Check server logs."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    additional_manual_courses = data.get("additionalManualCourses", [])

    if not user_id:
        app_logger.warning(f"Flask (Req ID: {req_id_cert}): User ID not provided.")
        return jsonify({"error": "User ID (userId) not provided"}), 400

    app_logger.info(f"Flask (Req ID: {req_id_cert}): Processing certificates for userId: {user_id}. Manual courses: {additional_manual_courses}")

    try:
        user_image_files_cursor = db.images.files.find({"metadata.userId": user_id})
        
        image_data_for_processing = []
        for file_doc in user_image_files_cursor:
            file_id = file_doc["_id"]
            original_filename = file_doc.get("metadata", {}).get("originalName", file_doc["filename"])
            content_type = file_doc.get("contentType", "application/octet-stream") 
            
            app_logger.info(f"Flask (Req ID: {req_id_cert}): Fetching file from GridFS: ID={file_id}, Name={original_filename}, Type={content_type}")
            grid_out = fs_images.get(file_id)
            image_bytes = grid_out.read()
            grid_out.close()
            
            effective_content_type = file_doc.get("metadata", {}).get("sourceContentType", content_type)
            if file_doc.get("metadata", {}).get("convertedTo"): 
                 effective_content_type = file_doc.get("metadata", {}).get("convertedTo")

            image_data_for_processing.append({
                "bytes": image_bytes,
                "original_filename": original_filename, 
                "content_type": effective_content_type, 
                "file_id": str(file_id) 
            })
        
        app_logger.info(f"Flask (Req ID: {req_id_cert}): Found {len(image_data_for_processing)} certificate images for user {user_id}.")

        # Fetch latest *structured* processing result for this user to use as cache
        latest_previous_user_data_list = []
        try:
            # We fetch only the 'user_processed_data' field from the latest document
            latest_doc = user_course_processing_collection.find_one(
                {"userId": user_id},
                sort=[("processedAt", DESCENDING)],
                projection={"user_processed_data": 1} # Get only this field
            )
            if latest_doc and "user_processed_data" in latest_doc:
                latest_previous_user_data_list = latest_doc["user_processed_data"]
                app_logger.info(f"Flask (Req ID: {req_id_cert}): Fetched 'user_processed_data' from latest record for user {user_id} to use as cache.")
            else:
                 app_logger.info(f"Flask (Req ID: {req_id_cert}): No previous processed data found for user {user_id} to use as cache.")
        except Exception as e:
            app_logger.error(f"Flask (Req ID: {req_id_cert}): Error fetching latest processed data for user {user_id}: {e}")


        if not image_data_for_processing and not additional_manual_courses:
            return jsonify({
                "message": "No certificate images found in the database and no manual courses provided for this user.",
                "user_processed_data": [],
                "processed_image_file_ids": []
            }), 200

        # Call the revamped processing function
        processing_result_dict = extract_and_recommend_courses_from_image_data(
            image_data_list=image_data_for_processing,
            previous_user_data_list=latest_previous_user_data_list, # Pass the cached items
            additional_manual_courses=additional_manual_courses
        )
        
        app_logger.info(f"Flask (Req ID: {req_id_cert}): Successfully processed certificates for user {user_id} via new structure.")

        # Simplified check for storing new results:
        # If the current `user_processed_data` is different from `latest_previous_user_data_list`
        # or if `latest_previous_user_data_list` was empty, then store.
        # A deep, sorted comparison of complex list of dicts can be tricky.
        # For now, if the content of user_processed_data seems different, store it.
        
        current_processed_data_for_comparison = processing_result_dict.get("user_processed_data", [])
        
        # Normalize for comparison: sort lists of dicts by a key (e.g., 'identified_course_name')
        # then convert to JSON strings for easier comparison. This handles order differences.
        def get_comparable_string(data_list):
            if not data_list: return "[]"
            try:
                # Sort outer list by 'identified_course_name'
                # For 'llm_suggestions' list within each, sort by 'name'
                normalized_list = sorted(
                    [
                        {
                            **item,
                            "llm_suggestions": sorted(item.get("llm_suggestions", []), key=lambda x: x.get("name", ""))
                        }
                        for item in data_list
                    ],
                    key=lambda x: x.get("identified_course_name", "")
                )
                return json.dumps(normalized_list)
            except Exception as e:
                app_logger.warning(f"Flask (Req ID: {req_id_cert}): Error normalizing data for comparison: {e}. Defaulting to simple string cast.")
                return str(data_list)


        should_store_new_result = True
        if latest_previous_user_data_list: # Only compare if there was previous data
            prev_str = get_comparable_string(latest_previous_user_data_list)
            curr_str = get_comparable_string(current_processed_data_for_comparison)
            if prev_str == curr_str:
                should_store_new_result = False
                app_logger.info(f"Flask (Req ID: {req_id_cert}): New processing result for user {user_id} is identical to the latest stored. Skipping storage.")
        
        if should_store_new_result and current_processed_data_for_comparison: # Only store if there's data
            try:
                data_to_store_in_db = {
                    "userId": user_id,
                    "processedAt": datetime.utcnow(),
                    "user_processed_data": current_processed_data_for_comparison, # Store the main data block
                    "processed_image_file_ids": processing_result_dict.get("processed_image_file_ids", []) # Store associated image IDs
                }
                insert_result = user_course_processing_collection.insert_one(data_to_store_in_db)
                app_logger.info(f"Flask (Req ID: {req_id_cert}): Stored new structured processing result for user {user_id}. Inserted ID: {insert_result.inserted_id}")
            except Exception as e:
                app_logger.error(f"Flask (Req ID: {req_id_cert}): Error storing new structured result for user {user_id}: {e}")
        
        # Return the full new structure to the frontend
        return jsonify(processing_result_dict)

    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


if __name__ == '__main__':
    app.logger.info("Flask application starting with __name__ == '__main__'")
    app_logger.info(f"Effective MONGODB_URI configured: {'Yes' if MONGODB_URI else 'No'}")
    app_logger.info(f"Effective MONGODB_DB_NAME: {DB_NAME}")
    app_logger.info("Flask app will attempt to run on host=0.0.0.0, port from env or 5000.")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)

```