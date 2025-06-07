
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import io
import logging
from pymongo import MongoClient
from gridfs import GridFS
from dotenv import load_dotenv

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
    # Potentially exit or raise an error if you want to prevent the app from starting
    # For now, it will allow starting but fail on API calls.

mongo_client = None
db = None
fs = None

try:
    if MONGODB_URI:
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) # 5 second timeout
        # The ismaster command is cheap and does not require auth.
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs = GridFS(db, collection="images") # GridFS bucket for 'images' collection
        app.logger.info(f"Successfully connected to MongoDB: {DB_NAME} and GridFS bucket 'images'.")
    else:
        app.logger.warning("MONGODB_URI not found, MongoDB connection will not be established.")
except Exception as e:
    app.logger.error(f"Failed to connect to MongoDB: {e}")
    mongo_client = None # Ensure client is None if connection failed


@app.route('/api/process-certificates', methods=['POST'])
def process_certificates_from_db():
    if not mongo_client or not db or not fs:
        app.logger.error("MongoDB connection not available for /api/process-certificates.")
        return jsonify({"error": "Database connection is not available. Check server logs."}), 503 # Service Unavailable

    data = request.get_json()
    user_id = data.get("userId")

    if not user_id:
        app.logger.warning("User ID not provided in request to /api/process-certificates.")
        return jsonify({"error": "User ID (userId) not provided"}), 400

    app.logger.info(f"Processing certificates for userId: {user_id}")

    try:
        # Find file metadata in 'images.files' for this user
        user_image_files_cursor = db.images.files.find({"metadata.userId": user_id})
        
        image_data_for_processing = []
        count = 0
        for file_doc in user_image_files_cursor:
            count += 1
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
                "file_id": str(file_id) # For logging/debugging
            })
        
        app.logger.info(f"Found {len(image_data_for_processing)} certificate images in GridFS for user {user_id}.")

        if not image_data_for_processing:
            return jsonify({
                "message": "No certificate images found in the database for this user.",
                "extracted_courses": [],
                "recommendations": []
            }), 200

        # Call the refactored processing function
        # This function now needs to handle a list of image data objects
        processing_result = extract_and_recommend_courses_from_image_data(image_data_for_processing)
        
        app.logger.info(f"Successfully processed certificates for user {user_id}. Result: {processing_result}")
        return jsonify(processing_result)

    except Exception as e:
        app.logger.error(f"Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

if __name__ == '__main__':
    # Make sure to run with `flask run` or `python app.py` in debug mode for development
    # The port and debug settings here are for direct `python app.py` execution.
    # When deploying, use a proper WSGI server like Gunicorn or Waitress.
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)
