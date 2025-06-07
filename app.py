
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import io
import logging
from pymongo import MongoClient, DESCENDING # Added DESCENDING
from gridfs import GridFS
from dotenv import load_dotenv
from datetime import datetime # Added datetime
import json # For sorting recommendations comparison

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
fs = None
course_data_collection = None # New collection instance

try:
    if MONGODB_URI:
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) # 5 second timeout
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs = GridFS(db, collection="images") 
        course_data_collection = db["course_data"] # Initialize course_data collection
        # Optional: Create index for faster queries on userId and processedAt for course_data
        # course_data_collection.create_index([("userId", 1), ("processedAt", -1)]) # For user-specific history
        # Potentially an index on processedAt if fetching all for cache becomes slow.
        # course_data_collection.create_index([("processedAt", -1)])
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
    additional_manual_courses = data.get("additionalManualCourses", []) # For future frontend use

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

        # Fetch ALL previous results from course_data to populate the recommendation cache globally
        # This list is used by certificate_processor to find existing recommendations.
        cache_population_docs = []
        try:
            # Fetch all documents. For very large collections, consider limiting or sampling.
            # Sorting by processedAt descending might help prioritize newer cache entries if the processor uses that.
            cache_population_docs = list(course_data_collection.find({}).sort("processedAt", DESCENDING))
            app.logger.info(f"Fetched {len(cache_population_docs)} documents from course_data to populate recommendation cache.")
        except Exception as e:
            app.logger.error(f"Error fetching documents for cache population from course_data: {e}")
            # Continue, processor will work without a pre-filled cache if this fails.
        
        # Fetch the latest previous result for THIS USER to check against for duplicate storage
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
            previous_results_list=cache_population_docs, # Pass all docs for cache
            additional_manual_courses=additional_manual_courses
        )
        
        app.logger.info(f"Successfully processed certificates for user {user_id}.")

        # --- Logic to prevent storing duplicate data for the SAME USER if nothing changed ---
        should_store_new_result = True
        if latest_previous_doc_for_user:
            # Compare extracted_courses (order-insensitive)
            prev_extracted = sorted(latest_previous_doc_for_user.get("extracted_courses", []))
            curr_extracted = sorted(processing_result.get("extracted_courses", []))
            
            # Compare recommendations (more complex, order-insensitive for items, content-sensitive)
            # Convert each recommendation dict to a sorted string to compare
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)

