
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
from pymongo import MongoClient, DESCENDING, UpdateOne
from bson.objectid import ObjectId
from gridfs import GridFS
from dotenv import load_dotenv
from datetime import datetime, timezone
import json
import io
from werkzeug.utils import secure_filename
from pdf2image import convert_from_bytes, pdfinfo_from_bytes
from pdf2image.exceptions import (
    PDFInfoNotInstalledError,
    PDFPageCountError,
    PDFSyntaxError,
    PDFPopplerTimeoutError
)
from PIL import Image

# --- Initial Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
app_logger = logging.getLogger(__name__)
app_logger.info("Flask app.py: Script execution started.")

load_dotenv()
app_logger.info(f"Flask app.py: .env loaded: {'Yes' if os.getenv('MONGODB_URI') else 'No (or MONGODB_URI not set)'}")

# Use specific import for clarity
from certificate_processor import infer_course_text_from_image_object, get_course_recommendations

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app_logger.info("Flask app instance created with CORS enabled for all origins.")

MONGODB_URI=
DB_NAME="imageverse_db"

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
        manual_course_names_collection.create_index([("userId", 1), ("fileId", 1)], unique=True, background=True)
        app.logger.info(f"Successfully connected to MongoDB: {DB_NAME}, GridFS bucket 'images', collection 'user_course_processing_results', and collection 'manual_course_names'.")
    else:
        app.logger.warning("MONGODB_URI not found, MongoDB connection will not be established.")
except Exception as e:
    app.logger.error(f"Failed to connect to MongoDB or initialize collections: {e}")
    mongo_client = None; db = None; fs_images = None; user_course_processing_collection = None; manual_course_names_collection = None

POPPLER_PATH = os.getenv("POPPLER_PATH", None)
if POPPLER_PATH: app_logger.info(f"Flask app.py: POPPLER_PATH found: {POPPLER_PATH}")
else: app_logger.info("Flask app.py: POPPLER_PATH not set (pdf2image will try to find Poppler in PATH).")


@app.route('/', methods=['GET'])
def health_check():
    app_logger.info("Flask /: Health check endpoint hit.")
    return jsonify({"status": "Flask server is running", "message": "Welcome to CertIntel Flask API!"}), 200

@app.route('/api/upload-and-process', methods=['POST'])
def upload_and_process_file():
    req_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app.logger.info(f"Flask /api/upload-and-process (Req ID: {req_id}): Received request.")
    
    if mongo_client is None or db is None or fs_images is None:
        return jsonify({"error": "Database connection or GridFS not available."}), 503
    
    if 'file' not in request.files:
        return jsonify({"error": "No 'file' part in the request."}), 400
    
    uploaded_file = request.files['file']
    user_id = request.form.get('userId')
    original_name = request.form.get('originalName', uploaded_file.filename)
    
    if not user_id: return jsonify({"error": "Missing 'userId' in form data."}), 400
    if not original_name: return jsonify({"error": "No filename or originalName provided."}), 400
    
    app.logger.info(f"Flask (Req ID: {req_id}): Processing '{original_name}' for userId '{user_id}'.")
    
    try:
        file_bytes = uploaded_file.read()
        content_type = uploaded_file.content_type
        
        pil_images = []
        source_is_pdf = False
        
        if content_type == 'application/pdf':
            source_is_pdf = True
            try:
                pdfinfo_from_bytes(file_bytes, userpw=None, poppler_path=POPPLER_PATH)
                pil_images = convert_from_bytes(file_bytes, dpi=200, fmt='png', poppler_path=POPPLER_PATH)
                app.logger.info(f"Flask (Req ID: {req_id}): PDF '{original_name}' converted to {len(pil_images)} image(s).")
            except Exception as pdf_err:
                 app.logger.error(f"Flask (Req ID: {req_id}): PDF conversion failed for '{original_name}': {pdf_err}")
                 return jsonify({"error": f"Failed to process PDF: {str(pdf_err)}"}), 500
        elif content_type and content_type.startswith('image/'):
            pil_images.append(Image.open(io.BytesIO(file_bytes)))
        else:
            return jsonify({"error": f"Unsupported file type: {content_type}"}), 415

        results_metadata = []
        for i, img_pil in enumerate(pil_images):
            page_number = i + 1
            
            extracted_courses, status = infer_course_text_from_image_object(img_pil)
            course_name = max(extracted_courses, key=len) if extracted_courses else None
            app.logger.info(f"Flask (Req ID: {req_id}): Page {page_number} of '{original_name}', Extracted Course: {course_name}, Status: {status}")

            img_byte_arr = io.BytesIO()
            img_pil.save(img_byte_arr, format='PNG')
            img_byte_arr_val = img_byte_arr.getvalue()
            
            final_original_name = f"{original_name} (Page {page_number})" if source_is_pdf and len(pil_images) > 1 else original_name
            base_secure_name = secure_filename(os.path.splitext(original_name)[0])
            gridfs_filename = f"{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{base_secure_name}_page_{page_number}.png"
            
            metadata_for_gridfs = {
                "userId": user_id,
                "originalName": final_original_name,
                "courseName": course_name,
                "uploadedAt": datetime.now(timezone.utc).isoformat(),
                "sourceContentType": content_type,
                "convertedTo": "image/png" if source_is_pdf else None,
                "pageNumber": page_number if source_is_pdf else None,
                "visibility": "public"
            }
            metadata_for_gridfs = {k: v for k, v in metadata_for_gridfs.items() if v is not None}

            file_id_obj = fs_images.put(
                img_byte_arr_val,
                filename=gridfs_filename,
                contentType='image/png',
                metadata=metadata_for_gridfs
            )
            app.logger.info(f"Flask (Req ID: {req_id}): Stored page {page_number} with GridFS ID: {str(file_id_obj)}. Metadata: {json.dumps(metadata_for_gridfs)}")

            results_metadata.append({
                "originalName": final_original_name,
                "fileId": str(file_id_obj),
                "filename": gridfs_filename,
                "contentType": 'image/png',
                "courseName": course_name,
                "pageNumber": page_number if source_is_pdf else None,
            })

        return jsonify(results_metadata), 201

    except Exception as e:
        app.logger.error(f"Flask (Req ID: {req_id}): Unhandled error in /api/upload-and-process: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/manual-course-name', methods=['POST'])
def save_manual_course_name():
    req_id_manual = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app.logger.info(f"Flask /api/manual-course-name (Req ID: {req_id_manual}): Received request.")
    
    if db is None:
        return jsonify({"error": "Database connection not available."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    file_id = data.get("fileId")
    course_name = data.get("courseName")
    
    if not all([user_id, file_id, course_name is not None]):
        return jsonify({"error": "Missing userId, fileId, or courseName"}), 400
    if not ObjectId.is_valid(file_id):
        return jsonify({"error": "Invalid fileId format"}), 400
        
    app.logger.info(f"Flask (Req ID: {req_id_manual}): Updating course name for userId: {user_id}, fileId: {file_id}, new courseName: '{course_name}'")
    
    try:
        files_collection = db.images.files
        update_result = files_collection.update_one(
            {"_id": ObjectId(file_id), "metadata.userId": user_id},
            {"$set": {"metadata.courseName": course_name.strip()}}
        )
        
        if update_result.matched_count == 0:
            app.logger.warning(f"Flask (Req ID: {req_id_manual}): File not found or permission denied for fileId {file_id} and userId {user_id}")
            return jsonify({"error": "File not found or you do not have permission to edit it."}), 404
            
        app.logger.info(f"Flask (Req ID: {req_id_manual}): Successfully updated course name for fileId {file_id}. Modified count: {update_result.modified_count}")
        return jsonify({"success": True, "message": "Course name updated."}), 200
        
    except Exception as e:
        app.logger.error(f"Flask (Req ID: {req_id_manual}): Error updating course name for fileId {file_id}: {str(e)}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred."}), 500


@app.route('/api/latest-processed-results', methods=['GET'])
def get_latest_processed_results():
    req_id_latest = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/latest-processed-results (Req ID: {req_id_latest}): Received GET request.")
    user_id = request.args.get('userId')
    if not user_id: return jsonify({"error": "userId query parameter is required"}), 400

    db_components_to_check = {"mongo_client": mongo_client, "db_instance": db, "user_course_processing_collection": user_course_processing_collection}
    missing_components = [name for name, comp in db_components_to_check.items() if comp is None]
    if missing_components: return jsonify({"error": f"DB component(s) not available: {', '.join(missing_components)}.", "errorKey": "DB_COMPONENT_UNAVAILABLE"}), 503

    try:
        latest_doc = user_course_processing_collection.find_one(
            {"userId": user_id},
            sort=[("processedAt", DESCENDING)]
        )
        if latest_doc:
            latest_doc["_id"] = str(latest_doc["_id"]) # Convert ObjectId
            latest_doc["processedAt"] = latest_doc["processedAt"].isoformat() if isinstance(latest_doc["processedAt"], datetime) else str(latest_doc["processedAt"])
            app_logger.info(f"Flask (Req ID: {req_id_latest}): Found latest processed document for userId '{user_id}'.")
            return jsonify(latest_doc), 200
        else:
            app_logger.info(f"Flask (Req ID: {req_id_latest}): No processed documents found for userId '{user_id}'.")
            return jsonify({"message": "No processed results found for this user."}), 404
    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_latest}): Error fetching latest processed results for userId {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


@app.route('/api/process-certificates', methods=['POST'])
def process_certificates_from_db():
    req_id_cert = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/process-certificates (Req ID: {req_id_cert}): Received request.")
    db_components_to_check = {"mongo_client": mongo_client, "db_instance": db, "gridfs_images_bucket": fs_images, "user_course_processing_collection": user_course_processing_collection, "manual_course_names_collection": manual_course_names_collection}
    missing_components = [name for name, comp in db_components_to_check.items() if comp is None]
    if missing_components: return jsonify({"error": f"DB component(s) not available: {', '.join(missing_components)}.", "errorKey": "DB_COMPONENT_UNAVAILABLE"}), 503

    data = request.get_json()
    user_id = data.get("userId")
    processing_mode = data.get("mode", "suggestions_only") # Default to suggestions
    known_course_names_from_frontend = data.get("knownCourseNames", [])
    force_refresh_for_courses = data.get("forceRefreshForCourses", [])
    associated_image_file_ids_from_previous_run = data.get("associated_image_file_ids_from_previous_run", None)

    if not user_id: return jsonify({"error": "User ID (userId) not provided"}), 400
    app_logger.info(f"Flask (Req ID: {req_id_cert}): Processing for userId: '{user_id}', Mode: {processing_mode}.")
    
    try:
        if processing_mode != 'suggestions_only':
            app_logger.error(f"Flask (Req ID: {req_id_cert}): Invalid processing_mode '{processing_mode}'. Only 'suggestions_only' is supported.")
            return jsonify({"error": f"Invalid processing mode: {processing_mode}"}), 400

        if not known_course_names_from_frontend:
            return jsonify({"user_processed_data": [], "llm_error_summary": "No course names provided for suggestion generation."}), 200

        latest_previous_user_data_list = []
        latest_cached_record = None
        try:
            latest_cached_record = user_course_processing_collection.find_one({"userId": user_id}, sort=[("processedAt", DESCENDING)])
            if latest_cached_record and "user_processed_data" in latest_cached_record:
                latest_previous_user_data_list = latest_cached_record["user_processed_data"]
                app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Fetched 'user_processed_data' from latest record for cache.")
        except Exception as e: app_logger.error(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Error fetching latest processed data: {e}")

        
        processing_result_dict = get_course_recommendations(
            known_course_names=known_course_names_from_frontend,
            previous_user_data_list=latest_previous_user_data_list,
            force_refresh_for_courses=force_refresh_for_courses
        )
        app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Suggestion processing complete.")

        current_processed_data_for_db = processing_result_dict.get("user_processed_data", [])
        should_store_new_result = True

        # Determine associated_image_file_ids for storage
        final_associated_ids_for_db = []
        if associated_image_file_ids_from_previous_run is not None:
             final_associated_ids_for_db = associated_image_file_ids_from_previous_run
        elif latest_cached_record and "associated_image_file_ids" in latest_cached_record:
             final_associated_ids_for_db = latest_cached_record["associated_image_file_ids"]
        else:
             final_associated_ids_for_db = [str(doc["_id"]) for doc in db.images.files.find({"metadata.userId": user_id}, projection={"_id": 1})]

        processing_result_dict["associated_image_file_ids"] = final_associated_ids_for_db


        if latest_previous_user_data_list and not force_refresh_for_courses:
            prev_course_names = set(item['identified_course_name'] for item in latest_previous_user_data_list)
            curr_course_names = set(item['identified_course_name'] for item in current_processed_data_for_db)
            if prev_course_names == curr_course_names:
                prev_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in latest_previous_user_data_list)
                curr_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in current_processed_data_for_db)
                if abs(prev_sug_counts - curr_sug_counts) <= len(curr_course_names): should_store_new_result = False

        if should_store_new_result and current_processed_data_for_db:
            try:
                data_to_store_in_db = {
                    "userId": user_id, "processedAt": datetime.now(timezone.utc),
                    "user_processed_data": current_processed_data_for_db,
                    "associated_image_file_ids": final_associated_ids_for_db,
                    "llm_error_summary_at_processing": processing_result_dict.get("llm_error_summary")
                }
                insert_result = user_course_processing_collection.insert_one(data_to_store_in_db)
                app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Stored new structured processing result. ID: {insert_result.inserted_id}")
            except Exception as e: app_logger.error(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Error storing new structured result: {e}")
        elif not current_processed_data_for_db: app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): No user processed data generated, nothing to store.")
        else: app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Result not stored (similar to previous or forced refresh).")
        
        return jsonify(processing_result_dict)

    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

if __name__ == '__main__':
    app.logger.info("Flask application starting with __name__ == '__main__'")
    app_logger.info(f"Effective MONGODB_URI configured: {'Yes' if MONGODB_URI else 'No'}")
    app_logger.info(f"Effective MONGODB_DB_NAME: {DB_NAME}")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)

    
