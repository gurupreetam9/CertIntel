
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import io
import logging
from pymongo import MongoClient, DESCENDING
from gridfs import GridFS
from dotenv import load_dotenv
from datetime import datetime
import json
from werkzeug.utils import secure_filename
import tempfile
from pdf2image import convert_from_bytes, pdfinfo_from_bytes
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError, PDFSyntaxError, PDFPopplerTimeoutError

# Load environment variables from .env file
load_dotenv()

# Import the refactored processing function
from certificate_processor import extract_and_recommend_courses_from_image_data

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)


# --- MongoDB Setup ---
MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB_NAME", "imageverse_db")

if not MONGODB_URI:
    app.logger.critical("MONGODB_URI is not set. Please set it in your .env file or environment variables.")

mongo_client = None
db = None
fs = None # GridFS for 'images' bucket
course_data_collection = None 

try:
    if MONGODB_URI:
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) 
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs = GridFS(db, collection="images") 
        course_data_collection = db["course_data"] 
        app.logger.info(f"Successfully connected to MongoDB: {DB_NAME}, GridFS bucket 'images', and collection 'course_data'.")
    else:
        app.logger.warning("MONGODB_URI not found, MongoDB connection will not be established.")
except Exception as e:
    app.logger.error(f"Failed to connect to MongoDB or initialize collections: {e}")
    mongo_client = None 
    db = None
    fs = None
    course_data_collection = None


@app.route('/api/process-certificates', methods=['POST'])
def process_certificates_from_db():
    if mongo_client is None or db is None or fs is None or course_data_collection is None:
        app.logger.error("MongoDB connection or course_data collection not available for /api/process-certificates.")
        return jsonify({"error": "Database connection or required collection is not available. Check server logs."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    additional_manual_courses = data.get("additionalManualCourses", []) 

    if not user_id:
        app.logger.warning("User ID not provided in request to /api/process-certificates.")
        return jsonify({"error": "User ID (userId) not provided"}), 400

    app.logger.info(f"Processing certificates for userId: {user_id}. Manual courses: {additional_manual_courses}")

    try:
        user_image_files_cursor = db.images.files.find({"metadata.userId": user_id})
        
        image_data_for_processing = []
        for file_doc in user_image_files_cursor:
            file_id = file_doc["_id"]
            original_filename = file_doc.get("metadata", {}).get("originalName", file_doc["filename"])
            content_type = file_doc.get("contentType", "application/octet-stream")
            
            app.logger.info(f"Fetching file from GridFS: ID={file_id}, Name={original_filename}, Type={content_type}")

            grid_out = fs.get(file_id)
            image_bytes = grid_out.read()
            grid_out.close()
            
            image_data_for_processing.append({
                "bytes": image_bytes,
                "original_filename": original_filename,
                "content_type": content_type,
                "file_id": str(file_id) 
            })
        
        app.logger.info(f"Found {len(image_data_for_processing)} certificate images in GridFS for user {user_id}.")

        cache_population_docs = []
        try:
            cache_population_docs = list(course_data_collection.find({}).sort("processedAt", DESCENDING))
            app.logger.info(f"Fetched {len(cache_population_docs)} documents from course_data to populate recommendation cache.")
        except Exception as e:
            app.logger.error(f"Error fetching documents for cache population from course_data: {e}")
        
        latest_previous_doc_for_user = None
        try:
            cursor = course_data_collection.find({"userId": user_id}).sort("processedAt", DESCENDING).limit(1)
            latest_previous_doc_for_user = next(cursor, None)
            if latest_previous_doc_for_user:
                app.logger.info(f"Fetched latest course_data record for user {user_id} for duplicate check.")
        except Exception as e:
            app.logger.error(f"Error fetching latest course_data for user {user_id}: {e}")


        if not image_data_for_processing and not additional_manual_courses:
            return jsonify({
                "message": "No certificate images found in the database and no manual courses provided for this user.",
                "extracted_courses": [],
                "recommendations": []
            }), 200

        processing_result = extract_and_recommend_courses_from_image_data(
            image_data_list=image_data_for_processing,
            previous_results_list=cache_population_docs,
            additional_manual_courses=additional_manual_courses
        )
        
        app.logger.info(f"Successfully processed certificates for user {user_id}.")

        should_store_new_result = True
        if latest_previous_doc_for_user:
            prev_extracted = sorted(latest_previous_doc_for_user.get("extracted_courses", []))
            curr_extracted = sorted(processing_result.get("extracted_courses", []))
            
            def serialize_recommendations(recs_list):
                if not recs_list: return "[]"
                return json.dumps(sorted([json.dumps(dict(sorted(r.items()))) for r in recs_list]))

            prev_recs_str = serialize_recommendations(latest_previous_doc_for_user.get("recommendations", []))
            curr_recs_str = serialize_recommendations(processing_result.get("recommendations", []))

            if prev_extracted == curr_extracted and prev_recs_str == curr_recs_str:
                should_store_new_result = False
                app.logger.info(f"Processing result for user {user_id} is identical to the latest stored. Skipping storage.")
        
        if should_store_new_result and \
           (processing_result.get("extracted_courses") or processing_result.get("recommendations")):
            try:
                data_to_store = {
                    "userId": user_id,
                    "processedAt": datetime.utcnow(),
                    **processing_result 
                }
                insert_result = course_data_collection.insert_one(data_to_store)
                app.logger.info(f"Stored new processing result for user {user_id} in course_data. Inserted ID: {insert_result.inserted_id}")
            except Exception as e:
                app.logger.error(f"Error storing result to course_data for user {user_id}: {e}")
        
        return jsonify(processing_result)

    except Exception as e:
        app.logger.error(f"Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/convert-pdf-to-images', methods=['POST'])
def convert_pdf_to_images_route():
    req_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app.logger.info(f"Flask /api/convert-pdf-to-images (Req ID: {req_id}): Received request.")

    if mongo_client is None or db is None or fs is None:
        app.logger.error(f"Flask (Req ID: {req_id}): MongoDB connection or GridFS not available.")
        return jsonify({"error": "Database connection or GridFS not available. Check server logs."}), 503

    if 'pdf_file' not in request.files:
        app.logger.warning(f"Flask (Req ID: {req_id}): No 'pdf_file' part in the request.")
        return jsonify({"error": "No PDF file part in the request."}), 400

    pdf_file_storage = request.files['pdf_file']
    user_id = request.form.get('userId')
    # Use originalName passed from Next.js, fallback to filename from storage
    original_pdf_name = request.form.get('originalName', pdf_file_storage.filename)


    if not user_id:
        app.logger.warning(f"Flask (Req ID: {req_id}): Missing 'userId' in form data.")
        return jsonify({"error": "Missing 'userId' in form data."}), 400
    
    if not original_pdf_name: # Check original_pdf_name now
        app.logger.warning(f"Flask (Req ID: {req_id}): No filename or originalName provided for PDF.")
        return jsonify({"error": "No filename provided for PDF."}), 400

    app.logger.info(f"Flask (Req ID: {req_id}): Processing PDF '{original_pdf_name}' for userId '{user_id}'.")

    try:
        pdf_bytes = pdf_file_storage.read()
        
        # Check if Poppler is installed and accessible by pdf2image
        try:
            pdfinfo = pdfinfo_from_bytes(pdf_bytes, userpw=None, poppler_path=None)
            app.logger.info(f"Flask (Req ID: {req_id}): Poppler self-check successful. PDF Info: {pdfinfo}")
        except PDFInfoNotInstalledError:
            app.logger.error(f"Flask (Req ID: {req_id}): CRITICAL - Poppler (pdfinfo) utilities not found or not executable. Please ensure 'poppler-utils' is installed and in the system PATH for the Flask server environment.")
            return jsonify({"error": "PDF processing utilities (Poppler/pdfinfo) are not installed or configured correctly on the server."}), 500
        except PDFPopplerTimeoutError:
            app.logger.error(f"Flask (Req ID: {req_id}): Poppler (pdfinfo) timed out processing the PDF. The PDF might be too complex or corrupted.")
            return jsonify({"error": "Timeout during PDF information retrieval. The PDF may be too complex or corrupted."}), 400
        except Exception as info_err: # Catch other potential errors from pdfinfo
            app.logger.error(f"Flask (Req ID: {req_id}): Error getting PDF info with Poppler: {str(info_err)}", exc_info=True)
            return jsonify({"error": f"Failed to retrieve PDF info: {str(info_err)}"}), 500


        app.logger.info(f"Flask (Req ID: {req_id}): Attempting to convert PDF bytes to images using pdf2image.")
        # Using fmt='png' for better quality for certificates, jpeg for smaller size if preferred
        images_from_pdf = convert_from_bytes(pdf_bytes, dpi=200, fmt='png', poppler_path=None) 
        app.logger.info(f"Flask (Req ID: {req_id}): PDF '{original_pdf_name}' converted to {len(images_from_pdf)} image(s).")

        converted_files_metadata = []

        for i, image_pil in enumerate(images_from_pdf):
            page_number = i + 1
            base_pdf_name = os.path.splitext(original_pdf_name)[0]
            gridfs_filename = f"{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{secure_filename(base_pdf_name)}_page_{page_number}.png"
            
            img_byte_arr = io.BytesIO()
            image_pil.save(img_byte_arr, format='PNG')
            img_byte_arr_val = img_byte_arr.getvalue()

            metadata_for_gridfs = {
                "originalName": f"{original_pdf_name} (Page {page_number})",
                "userId": user_id,
                "uploadedAt": datetime.utcnow().isoformat(),
                "sourceContentType": "application/pdf",
                "convertedTo": "image/png",
                "pageNumber": page_number,
                "reqIdParent": req_id 
            }
            
            app.logger.info(f"Flask (Req ID: {req_id}): Storing page {page_number} as '{gridfs_filename}' in GridFS.")
            file_id_obj = fs.put(img_byte_arr_val, filename=gridfs_filename, contentType='image/png', metadata=metadata_for_gridfs)
            
            converted_files_metadata.append({
                "originalName": metadata_for_gridfs["originalName"],
                "fileId": str(file_id_obj),
                "filename": gridfs_filename,
                "pageNumber": page_number
            })
            app.logger.info(f"Flask (Req ID: {req_id}): Stored page {page_number} with GridFS ID: {str(file_id_obj)}.")

        app.logger.info(f"Flask (Req ID: {req_id}): Successfully processed and stored {len(converted_files_metadata)} pages for PDF '{original_pdf_name}'.")
        return jsonify({"message": "PDF converted and pages stored successfully.", "converted_files": converted_files_metadata}), 200

    except PDFPageCountError:
        app.logger.error(f"Flask (Req ID: {req_id}): pdf2image could not get page count for '{original_pdf_name}'. PDF might be corrupted or password-protected.", exc_info=True)
        return jsonify({"error": "Could not determine page count. The PDF may be corrupted or password-protected."}), 400
    except PDFSyntaxError:
        app.logger.error(f"Flask (Req ID: {req_id}): pdf2image encountered syntax error for '{original_pdf_name}'. PDF is likely corrupted.", exc_info=True)
        return jsonify({"error": "PDF syntax error. The file may be corrupted."}), 400
    except PDFPopplerTimeoutError: # Catch timeout during actual conversion
        app.logger.error(f"Flask (Req ID: {req_id}): Poppler (conversion) timed out processing PDF '{original_pdf_name}'.")
        return jsonify({"error": "Timeout during PDF page conversion. The PDF may be too complex."}), 400
    except Exception as e:
        app.logger.error(f"Flask (Req ID: {req_id}): Error during PDF conversion or storage for '{original_pdf_name}': {str(e)}", exc_info=True)
        # Check if it's a PopplerNotInstalledError (though pdfinfo_from_bytes should catch it earlier)
        if "PopplerNotInstalledError" in str(type(e)) or "pdftoppm" in str(e).lower():
             app.logger.error(f"Flask (Req ID: {req_id}): CRITICAL - Poppler (pdftoppm) utilities not found or not executable.")
             return jsonify({"error": "PDF processing utilities (Poppler) are not installed or configured correctly on the server (conversion stage)."}), 500
        return jsonify({"error": f"An unexpected error occurred during PDF processing: {str(e)}"}), 500


if __name__ == '__main__':
    app.logger.info("Flask application starting...")
    app.logger.info("Ensure 'poppler-utils' (or equivalent Poppler binaries) are installed and accessible in the system PATH.")
    app.logger.info(f"MongoDB URI configured: {'Yes' if MONGODB_URI else 'No'}")
    app.logger.info(f"MongoDB DB Name: {DB_NAME}")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)

