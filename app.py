
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
from pymongo import MongoClient, DESCENDING, UpdateOne
from bson.objectid import ObjectId
from gridfs import GridFS  # <--- IMPORT ADDED HERE
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

# --- Initial Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
app_logger = logging.getLogger(__name__)
app_logger.info("Flask app.py: Script execution started.")

load_dotenv()
app_logger.info(f"Flask app.py: .env loaded: {'Yes' if os.getenv('MONGODB_URI') else 'No (or MONGODB_URI not set)'}")

from certificate_processor import extract_and_recommend_courses_from_image_data

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app_logger.info("Flask app instance created with CORS enabled for all origins.")

MONGODB_URI="mongodb+srv://gurupreetambodapati:MTXH7oEVPg3sJdg2@cluster0.fpsg1.mongodb.net/"
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
    return jsonify({"status": "Flask server is running", "message": "Welcome to ImageVerse Flask API!"}), 200

@app.route('/api/manual-course-name', methods=['POST'])
def save_manual_course_name():
    req_id_manual_name = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/manual-course-name (Req ID: {req_id_manual_name}): Received request.")
    missing_components = [name for name, comp in {"mongo_client": mongo_client, "db_instance": db, "manual_course_names_collection": manual_course_names_collection}.items() if comp is None]
    if missing_components: return jsonify({"error": f"Database component(s) not available: {', '.join(missing_components)}.", "errorKey": "DB_COMPONENT_UNAVAILABLE"}), 503

    data = request.get_json()
    user_id, file_id, course_name = data.get("userId"), data.get("fileId"), data.get("courseName")
    if not all([user_id, file_id, course_name]): return jsonify({"error": "Missing userId, fileId, or courseName"}), 400
    app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Saving manual name for userId: {user_id}, fileId: {file_id}, courseName: '{course_name}'")
    try:
        update_result = manual_course_names_collection.update_one(
            {"userId": user_id, "fileId": file_id},
            {"$set": {"courseName": course_name, "updatedAt": datetime.now(timezone.utc)}, "$setOnInsert": {"createdAt": datetime.now(timezone.utc)}},
            upsert=True
        )
        if update_result.upserted_id: app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Inserted new manual course name. ID: {update_result.upserted_id}")
        elif update_result.modified_count > 0: app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Updated existing manual course name.")
        else: app_logger.info(f"Flask (Req ID: {req_id_manual_name}): Manual course name was already up-to-date. Matched: {update_result.matched_count}")
        return jsonify({"success": True, "message": "Manual course name saved."}), 200
    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_manual_name}): Error saving manual course name for userId {user_id}, fileId {file_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

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
    processing_mode = data.get("mode", "ocr_only")
    additional_manual_courses_general = data.get("additionalManualCourses", [])
    known_course_names_from_frontend = data.get("knownCourseNames", [])
    all_image_file_ids_from_frontend = data.get("allImageFileIds", []) # New for OCR mode
    force_refresh_for_courses = data.get("forceRefreshForCourses", []) # New for suggestions mode
    associated_image_file_ids_from_previous_run = data.get("associated_image_file_ids_from_previous_run", None)


    if not user_id: return jsonify({"error": "User ID (userId) not provided"}), 400
    app_logger.info(f"Flask (Req ID: {req_id_cert}): Processing for userId: '{user_id}', Mode: {processing_mode}.")
    app_logger.info(f"Flask (Req ID: {req_id_cert}): General Manual Courses: {additional_manual_courses_general}, AllImageFileIDs: {all_image_file_ids_from_frontend}, ForceRefresh: {force_refresh_for_courses}")

    try:
        processing_result_dict = {}

        if processing_mode == 'ocr_only':
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): User has {len(all_image_file_ids_from_frontend)} total images from frontend.")
            images_for_ocr_processing = []
            already_named_courses = []

            # Get all manually named courses for this user
            manual_names_cursor = manual_course_names_collection.find({"userId": user_id, "fileId": {"$in": all_image_file_ids_from_frontend}})
            manual_names_map = {item["fileId"]: item["courseName"] for item in manual_names_cursor}
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Found {len(manual_names_map)} relevant manual names for user {user_id}.")

            for file_id_str in all_image_file_ids_from_frontend:
                if file_id_str in manual_names_map:
                    already_named_courses.append(manual_names_map[file_id_str])
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): FileId {file_id_str} has manual name '{manual_names_map[file_id_str]}'. Skipping OCR, adding to successes.")
                else:
                    try:
                        file_doc = db.images.files.find_one({"_id": ObjectId(file_id_str), "metadata.userId": user_id})
                        if file_doc:
                            grid_out = fs_images.get(ObjectId(file_id_str))
                            image_bytes = grid_out.read()
                            grid_out.close()
                            effective_content_type = file_doc.get("metadata", {}).get("sourceContentType", file_doc.get("contentType", "application/octet-stream"))
                            if file_doc.get("metadata", {}).get("convertedTo"):
                                effective_content_type = file_doc.get("metadata", {}).get("convertedTo")

                            images_for_ocr_processing.append({
                                "bytes": image_bytes,
                                "original_filename": file_doc.get("metadata", {}).get("originalName", file_doc["filename"]),
                                "content_type": effective_content_type,
                                "file_id": file_id_str
                            })
                            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): FileId {file_id_str} needs OCR. Added to processing list.")
                        else:
                            app_logger.warning(f"Flask (Req ID: {req_id_cert}, OCR_MODE): FileId {file_id_str} not found in GridFS for user or GridFS doc missing metadata. Skipping.")
                    except Exception as e_gridfs:
                        app_logger.error(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Error fetching GridFS file {file_id_str}: {e_gridfs}")

            if not images_for_ocr_processing and not already_named_courses and not additional_manual_courses_general:
                 app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): No images for OCR, no existing manual names, and no general manual courses. Returning empty.")
                 return jsonify({"successfully_extracted_courses": [], "failed_extraction_images": [], "processed_image_file_ids": all_image_file_ids_from_frontend}), 200

            ocr_processor_results = extract_and_recommend_courses_from_image_data(
                image_data_list=images_for_ocr_processing, # Only send candidates
                mode='ocr_only',
                additional_manual_courses=[] # General manual courses are handled after processor
            )
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): OCR processor returned. Newly extracted: {len(ocr_processor_results.get('successfully_extracted_courses',[]))}, Newly failed: {len(ocr_processor_results.get('failed_extraction_images',[]))}")

            # Combine results
            final_successful_courses = list(set(already_named_courses + ocr_processor_results.get("successfully_extracted_courses", []) + additional_manual_courses_general))

            processing_result_dict = {
                "successfully_extracted_courses": sorted(final_successful_courses),
                "failed_extraction_images": ocr_processor_results.get("failed_extraction_images", []), # These are images that genuinely failed OCR and didn't have a manual name
                "processed_image_file_ids": all_image_file_ids_from_frontend # Reflects all images client considered
            }
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Final OCR results - Success: {len(final_successful_courses)}, Failures to prompt: {len(processing_result_dict['failed_extraction_images'])}.")

        elif processing_mode == 'suggestions_only':
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

            processing_result_dict = extract_and_recommend_courses_from_image_data(
                mode='suggestions_only',
                known_course_names=known_course_names_from_frontend,
                previous_user_data_list=latest_previous_user_data_list,
                force_refresh_for_courses=force_refresh_for_courses # Pass this to processor
            )
            app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Suggestion processing complete.")

            current_processed_data_for_db = processing_result_dict.get("user_processed_data", [])
            should_store_new_result = True

            # Determine associated_image_file_ids for storage
            final_associated_ids_for_db = []
            if associated_image_file_ids_from_previous_run is not None: # If client sent it (meaning OCR just ran or loading from cache)
                 final_associated_ids_for_db = associated_image_file_ids_from_previous_run
            elif latest_cached_record and "associated_image_file_ids" in latest_cached_record: # Fallback to latest db record's IDs
                 final_associated_ids_for_db = latest_cached_record["associated_image_file_ids"]
            else: # Absolute fallback: all current user images (less accurate for suggestion context)
                 final_associated_ids_for_db = [str(doc["_id"]) for doc in db.images.files.find({"metadata.userId": user_id}, projection={"_id": 1})]

            processing_result_dict["associated_image_file_ids"] = final_associated_ids_for_db # Ensure this is in the response


            if latest_previous_user_data_list and not force_refresh_for_courses: # Only compare if not forcing refresh
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
        else:
            app_logger.error(f"Flask (Req ID: {req_id_cert}): Invalid processing_mode '{processing_mode}'.")
            return jsonify({"error": f"Invalid processing mode: {processing_mode}"}), 400

        return jsonify(processing_result_dict)

    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/convert-pdf-to-images', methods=['POST'])
def convert_pdf_to_images_route():
    req_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app.logger.info(f"Flask /api/convert-pdf-to-images (Req ID: {req_id}): Received request.")
    if mongo_client is None or db is None or fs_images is None: return jsonify({"error": "Database connection or GridFS not available."}), 503
    if 'pdf_file' not in request.files: return jsonify({"error": "No PDF file part in the request."}), 400

    pdf_file_storage = request.files['pdf_file']
    user_id = request.form.get('userId')
    original_pdf_name = request.form.get('originalName', pdf_file_storage.filename)


    if not user_id: return jsonify({"error": "Missing 'userId' in form data."}), 400
    if not original_pdf_name: return jsonify({"error": "No filename or originalName provided for PDF."}), 400
    app.logger.info(f"Flask (Req ID: {req_id}): Processing PDF '{original_pdf_name}' for userId '{user_id}'.")

    try:
        pdf_bytes = pdf_file_storage.read()
        try:
            app.logger.info(f"Flask (Req ID: {req_id}): Using POPPLER_PATH for pdfinfo: '{POPPLER_PATH if POPPLER_PATH else 'System Default'}'")
            pdfinfo = pdfinfo_from_bytes(pdf_bytes, userpw=None, poppler_path=POPPLER_PATH)
            app.logger.info(f"Flask (Req ID: {req_id}): Poppler self-check (pdfinfo) successful. PDF Info: {pdfinfo}")
        except PDFInfoNotInstalledError: return jsonify({"error": "PDF processing utilities (Poppler/pdfinfo) are not installed or configured correctly on the server."}), 500
        except PDFPopplerTimeoutError: return jsonify({"error": "Timeout during PDF information retrieval."}), 400
        except Exception as info_err: return jsonify({"error": f"Failed to retrieve PDF info: {str(info_err)}"}), 500

        images_from_pdf = convert_from_bytes(pdf_bytes, dpi=200, fmt='png', poppler_path=POPPLER_PATH)
        app.logger.info(f"Flask (Req ID: {req_id}): PDF '{original_pdf_name}' converted to {len(images_from_pdf)} image(s).")
        converted_files_metadata = []

        for i, image_pil in enumerate(images_from_pdf):
            page_number = i + 1
            base_pdf_name_secure = secure_filename(os.path.splitext(original_pdf_name)[0])
            gridfs_filename = f"{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{base_pdf_name_secure}_page_{page_number}.png"
            img_byte_arr = io.BytesIO(); image_pil.save(img_byte_arr, format='PNG'); img_byte_arr_val = img_byte_arr.getvalue()
            metadata_for_gridfs = {
                "originalName": f"{original_pdf_name} (Page {page_number})", 
                "userId": user_id, 
                "uploadedAt": datetime.now(timezone.utc).isoformat(), 
                "sourceContentType": "application/pdf", 
                "convertedTo": "image/png", 
                "pageNumber": page_number, 
                "reqIdParent": req_id,
                "visibility": "public" # Default to public
            }
            file_id_obj = fs_images.put(img_byte_arr_val, filename=gridfs_filename, contentType='image/png', metadata=metadata_for_gridfs)
            converted_files_metadata.append({"originalName": metadata_for_gridfs["originalName"], "fileId": str(file_id_obj), "filename": gridfs_filename, "contentType": 'image/png', "pageNumber": page_number})
            app.logger.info(f"Flask (Req ID: {req_id}): Stored page {page_number} with GridFS ID: {str(file_id_obj)}. Metadata: {json.dumps(metadata_for_gridfs)}")

        app.logger.info(f"Flask (Req ID: {req_id}): Successfully processed and stored {len(converted_files_metadata)} pages for PDF '{original_pdf_name}'.")
        return jsonify({"message": "PDF converted and pages stored successfully.", "converted_files": converted_files_metadata}), 200

    except PDFPageCountError: return jsonify({"error": "Could not determine page count. PDF may be corrupted or password-protected."}), 400
    except PDFSyntaxError: return jsonify({"error": "File may be corrupted."}), 400
    except PDFPopplerTimeoutError: return jsonify({"error": "Timeout during PDF page conversion."}), 400
    except Exception as e:
        if "PopplerNotInstalledError" in str(type(e)) or "pdftoppm" in str(e).lower() or "pdfinfo" in str(e).lower(): return jsonify({"error": "PDF processing utilities (Poppler) are not installed/configured correctly (conversion stage)."}), 500
        return jsonify({"error": f"An unexpected error occurred during PDF processing: {str(e)}"}), 500

if __name__ == '__main__':
    app.logger.info("Flask application starting with __name__ == '__main__'")
    app_logger.info(f"Effective MONGODB_URI configured: {'Yes' if MONGODB_URI else 'No'}")
    app_logger.info(f"Effective MONGODB_DB_NAME: {DB_NAME}")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)



    

    
