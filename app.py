
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
from pymongo import MongoClient, DESCENDING
from gridfs import GridFSA
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
course_data_collection = None 

try:
    if MONGODB_URI:
        app.logger.info(f"Attempting to connect to MongoDB with URI (first part): {MONGODB_URI.split('@')[0] if '@' in MONGODB_URI else 'URI_FORMAT_UNEXPECTED'}")
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) 
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs_images = GridFS(db, collection="images") 
        course_data_collection = db["course_data"] 
        app.logger.info(f"Successfully connected to MongoDB: {DB_NAME}, GridFS bucket 'images', and collection 'course_data'.")
    else:
        app.logger.warning("MONGODB_URI not found, MongoDB connection will not be established.")
except Exception as e:
    app.logger.error(f"Failed to connect to MongoDB or initialize collections: {e}")
    mongo_client = None 
    db = None
    fs_images = None
    course_data_collection = None

# Check Poppler Path for pdf2image
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
    if mongo_client is None or db is None or fs_images is None or course_data_collection is None:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): MongoDB connection or course_data collection not available for /api/process-certificates.")
        return jsonify({"error": "Database connection or required collection is not available. Check server logs."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    additional_manual_courses = data.get("additionalManualCourses", []) # Get manual courses

    if not user_id:
        app_logger.warning(f"Flask (Req ID: {req_id_cert}): User ID not provided in request to /api/process-certificates.")
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
        
        app_logger.info(f"Flask (Req ID: {req_id_cert}): Found {len(image_data_for_processing)} certificate images in GridFS for user {user_id}.")

        cache_population_docs = []
        try:
            cache_population_docs = list(course_data_collection.find({}).sort("processedAt", DESCENDING))
            app_logger.info(f"Flask (Req ID: {req_id_cert}): Fetched {len(cache_population_docs)} documents from course_data to populate recommendation cache.")
        except Exception as e:
            app_logger.error(f"Flask (Req ID: {req_id_cert}): Error fetching documents for cache population from course_data: {e}")
        
        latest_previous_doc_for_user = None
        try:
            cursor = course_data_collection.find({"userId": user_id}).sort("processedAt", DESCENDING).limit(1)
            latest_previous_doc_for_user = next(cursor, None)
            if latest_previous_doc_for_user:
                app_logger.info(f"Flask (Req ID: {req_id_cert}): Fetched latest course_data record for user {user_id} for duplicate check.")
        except Exception as e:
            app_logger.error(f"Flask (Req ID: {req_id_cert}): Error fetching latest course_data for user {user_id}: {e}")

        if not image_data_for_processing and not additional_manual_courses:
            return jsonify({
                "message": "No certificate images found in the database and no manual courses provided for this user.",
                "extracted_courses": [],
                "recommendations": []
            }), 200

        processing_result = extract_and_recommend_courses_from_image_data(
            image_data_list=image_data_for_processing,
            previous_results_list=cache_population_docs,
            additional_manual_courses=additional_manual_courses # Pass manual courses
        )
        
        app_logger.info(f"Flask (Req ID: {req_id_cert}): Successfully processed certificates for user {user_id}.")

        should_store_new_result = True
        if latest_previous_doc_for_user:
            # Normalize and sort for comparison
            prev_extracted = sorted([c.lower().strip() for c in latest_previous_doc_for_user.get("extracted_courses", [])])
            curr_extracted = sorted([c.lower().strip() for c in processing_result.get("extracted_courses", [])])
            
            def serialize_recommendations(recs_list):
                if not recs_list: return "[]"
                # Sort each recommendation dict by key, then dump to string, then sort list of strings
                return json.dumps(sorted([json.dumps(dict(sorted(r.items()))) for r in recs_list]))

            prev_recs_str = serialize_recommendations(latest_previous_doc_for_user.get("recommendations", []))
            curr_recs_str = serialize_recommendations(processing_result.get("recommendations", []))

            if prev_extracted == curr_extracted and prev_recs_str == curr_recs_str:
                should_store_new_result = False
                app_logger.info(f"Flask (Req ID: {req_id_cert}): Processing result for user {user_id} is identical to the latest stored. Skipping storage.")
        
        if should_store_new_result and \
           (processing_result.get("extracted_courses") or processing_result.get("recommendations")):
            try:
                data_to_store = {
                    "userId": user_id,
                    "processedAt": datetime.utcnow(),
                    **processing_result 
                }
                insert_result = course_data_collection.insert_one(data_to_store)
                app_logger.info(f"Flask (Req ID: {req_id_cert}): Stored new processing result for user {user_id} in course_data. Inserted ID: {insert_result.inserted_id}")
            except Exception as e:
                app_logger.error(f"Flask (Req ID: {req_id_cert}): Error storing result to course_data for user {user_id}: {e}")
        
        return jsonify(processing_result)

    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


if __name__ == '__main__':
    app.logger.info("Flask application starting with __name__ == '__main__'")
    app_logger.info(f"Effective MONGODB_URI configured: {'Yes' if MONGODB_URI else 'No'}")
    app_logger.info(f"Effective MONGODB_DB_NAME: {DB_NAME}")
    app_logger.info("Flask app will attempt to run on host=0.0.0.0, port from env or 5000.")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)


    