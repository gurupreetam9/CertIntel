
import logging
# Disable ultralytics specific logging if too verbose
# logging.getLogger("ultralytics").disabled = True 
# Consider configuring logging more globally in your Flask app

import os
import cv2
import pytesseract
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO
from pdf2image import convert_from_bytes # Changed from convert_from_path
import numpy as np
import re
import nltk
from nltk.corpus import words as nltk_words, stopwords
from sentence_transformers import SentenceTransformer, util
import cohere
from difflib import SequenceMatcher
import json
import io # For BytesIO

# --- Initial Setup (Consider running these once during app startup/build) ---
try:
    nltk.data.find('corpora/words')
except nltk.downloader.DownloadError:
    nltk.download('words', quiet=True)

try:
    nltk.data.find('corpora/stopwords')
except nltk.downloader.DownloadError:
    nltk.download('stopwords', quiet=True)


english_vocab = set(w.lower() for w in nltk_words.words())
stop_words = set(stopwords.words('english'))
course_keywords = {"course", "certification", "developer", "programming", "bootcamp", "internship", "award", "degree", "diploma", "training"}

# --- Constants ---
# CERT_FOLDER = "./certificates" # No longer primary input method
FALLBACK_FILE = "llm_fallback_results.json" # Consider making path configurable or relative to app root
COHERE_API_KEY = os.getenv("COHERE_API_KEY") # Get from environment

if not COHERE_API_KEY:
    logging.warning("COHERE_API_KEY not found in environment variables. LLM fallback will not work.")
    co = None
else:
    co = cohere.Client(COHERE_API_KEY)


possible_courses = ["HTML", "CSS", "JavaScript", "React", "Astro.js", "Python", "Flask", "C Programming", "Kotlin", "Ethical Hacking", "Networking", "Node.js", "Machine Learning", "Data Structures", "Operating Systems", "Next.js", "Remix", "Express.js", "MongoDB", "Docker", "Kubernetes", "Tailwind CSS", "Django"]

course_graph = {
    "HTML": {
        "description": "HTML (HyperText Markup Language) is the standard language for creating webpages.",
        "next_courses": ["CSS", "JavaScript"],
        "url": "https://www.freecodecamp.org/learn/responsive-web-design/"
    },
    "CSS": {
        "description": "CSS (Cascading Style Sheets) is used to style and layout web pages.",
        "next_courses": ["JavaScript", "Tailwind CSS", "React"],
        "url": "https://developer.mozilla.org/en-US/docs/Web/CSS"
    },
    "JavaScript": {
        "description": "JavaScript adds interactivity to websites and is essential for frontend development.",
        "next_courses": ["React", "Node.js", "Vue.js", "Angular"],
        "url": "https://www.javascript.info/"
    },
    "Python": {
        "description": "Python is a versatile programming language used in web, AI, and automation.",
        "next_courses": ["Flask", "Django", "Machine Learning", "Data Science"],
        "url": "https://www.learnpython.org/"
    },
    "React": {
        "description": "React is a popular JavaScript library for building interactive UIs.",
        "next_courses": ["Next.js", "Remix", "Redux", "GraphQL"],
        "url": "https://react.dev/"
    },
    "Flask": {
        "description": "Flask is a lightweight Python web framework great for small web apps.",
        "next_courses": ["Docker", "SQLAlchemy", "REST APIs"],
        "url": "https://flask.palletsprojects.com/"
    },
    "Django": {
        "description": "Django is a high-level Python web framework that encourages rapid development.",
        "next_courses": ["Django REST framework", "Celery", "PostgreSQL"],
        "url": "https://www.djangoproject.com/"
    },
    "C Programming": {
        "description": "C is a foundational programming language great for system-level development.",
        "next_courses": ["Data Structures", "Operating Systems", "C++"],
        "url": "https://www.learn-c.org/"
    },
    "Node.js": {
        "description": "Node.js is a runtime environment to run JavaScript on the server side.",
        "next_courses": ["Express.js", "MongoDB", "NestJS"],
        "url": "https://nodejs.dev/en/learn"
    },
    "Machine Learning": {
        "description": "Machine Learning is a branch of AI focused on building systems that learn from data.",
        "next_courses": ["Deep Learning", "Natural Language Processing", "Computer Vision"],
        "url": "https://www.coursera.org/specializations/machine-learning-introduction"
    },
     "Ethical Hacking": {
        "description": "Ethical Hacking involves finding security vulnerabilities to help organizations improve their security posture.",
        "next_courses": ["Penetration Testing", "Cybersecurity Analyst", "Digital Forensics"],
        "url": "https://www.eccouncil.org/programs/certified-ethical-hacker-ceh/"
    },
    "Networking": {
        "description": "Networking focuses on the design, implementation, and management of computer networks.",
        "next_courses": ["CCNA", "Network Security", "Cloud Networking"],
        "url": "https://www.cisco.com/c/en/us/training-events/training-certifications/certifications/associate/ccna.html"
    }
    # Add more courses to the graph as needed
}

# --- YOLO and Sentence Transformer Model Loading ---
# IMPORTANT: Ensure this model path is correct and accessible in your Flask server environment.
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "/home/luffy/Downloads/certificate.v1i.yolov8(1)/runs/detect/exp/weights/best.pt") 
model = None
try:
    if os.path.exists(YOLO_MODEL_PATH):
        model = YOLO(YOLO_MODEL_PATH)
        logging.info(f"Successfully loaded YOLO model from: {YOLO_MODEL_PATH}")
    else:
        logging.error(f"YOLO model not found at path: {YOLO_MODEL_PATH}. Please check the path or set YOLO_MODEL_PATH environment variable.")
except Exception as e:
    logging.error(f"Error loading YOLO model: {e}")

sentence_model = None
try:
    sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
    logging.info("Successfully loaded SentenceTransformer model.")
except Exception as e:
    logging.error(f"Error loading SentenceTransformer model: {e}")


def clean_unicode(text):
    return text.encode("utf-8", "replace").decode("utf-8")


def infer_course_text_from_image_object(pil_image_obj):
    """
    Performs YOLO inference and OCR on a PIL Image object.
    """
    if not model:
        logging.error("YOLO model is not loaded. Cannot infer course text.")
        return None
    try:
        image_np = np.array(pil_image_obj)
        # Ensure image is in RGB if it's RGBA (e.g. from PNG)
        if image_np.shape[2] == 4:
             image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)

        results = model(image_np) # Pass numpy array to YOLO model
        names = results[0].names
        boxes = results[0].boxes

        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                label = names[cls_id]

                # Check if label is one of the target labels for course names
                if label.lower() in ["certificatecourse", "course", "title", "name"]: # Added more potential labels
                    left, top, right, bottom = map(int, box.xyxy[0].cpu().numpy())
                    cropped_pil_image = pil_image_obj.crop((left, top, right, bottom))
                    
                    # Preprocessing for OCR (optional, but can help)
                    # cropped_cv_image = np.array(cropped_pil_image)
                    # gray = cv2.cvtColor(cropped_cv_image, cv2.COLOR_BGR2GRAY)
                    # thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
                    # text = pytesseract.image_to_string(Image.fromarray(thresh)).strip()

                    text = pytesseract.image_to_string(cropped_pil_image).strip()
                    cleaned_text = clean_unicode(text)
                    if cleaned_text: # Return the first non-empty text found
                        logging.info(f"Extracted text from detected region ('{label}'): '{cleaned_text}'")
                        return cleaned_text
        else:
            logging.warning("No relevant bounding boxes detected by YOLO.")
        
        # Fallback: If no specific region found, OCR the whole image (less accurate for specific fields)
        logging.info("No specific course region found, attempting OCR on the whole image as fallback.")
        full_image_text = pytesseract.image_to_string(pil_image_obj).strip()
        cleaned_full_text = clean_unicode(full_image_text)
        if cleaned_full_text:
            logging.info(f"Extracted text from full image (fallback): '{cleaned_full_text[:100]}...'") # Log snippet
            return cleaned_full_text

        return None

    except Exception as e:
        logging.error(f"Error during YOLO inference or OCR: {e}", exc_info=True)
        return None


def extract_course_names_from_text(text):
    """Extracts known course names from text."""
    if not text: return []
    # More robust extraction: consider variations, case-insensitivity
    found_courses = []
    text_lower = text.lower()
    for course in possible_courses:
        # Use regex for whole word matching to avoid partial matches (e.g., "C" in "CSS")
        if re.search(r'\b' + re.escape(course.lower()) + r'\b', text_lower):
            found_courses.append(course)
    return list(set(found_courses)) # Unique courses


def get_closest_known_course(unknown_course_text):
    """Finds the most similar known course from the course_graph."""
    if not sentence_model:
        logging.error("Sentence model not loaded. Cannot find closest course.")
        return None, 0.0

    known_course_names = list(course_graph.keys())
    if not known_course_names:
        return None, 0.0

    try:
        embeddings = sentence_model.encode(known_course_names + [unknown_course_text])
        similarity_scores = util.cos_sim(embeddings[-1], embeddings[:-1])
        best_match_index = similarity_scores.argmax()
        score = similarity_scores[0][best_match_index].item()
        return known_course_names[best_match_index], score
    except Exception as e:
        logging.error(f"Error getting closest course for '{unknown_course_text}': {e}")
        return None, 0.0


def filter_and_verify_course_text(text):
    """
    Filters extracted text to identify potential course names, marks unverified ones.
    """
    if not text or len(text) < 3: # Basic filter for very short/empty strings
        return []

    # Remove common certificate phrases that are not course names
    phrases_to_remove = ["certificate of completion", "certificate of achievement", "is awarded to", "has successfully completed"]
    temp_text = text.lower()
    for phrase in phrases_to_remove:
        temp_text = temp_text.replace(phrase, "")
    
    # Split by lines, clean, and consider longer lines more likely to be titles
    potential_course_lines = [line.strip() for line in temp_text.split('\n') if len(line.strip()) > 4] # Min length for a course name part
    
    identified_courses = []

    # First, try direct matching from `possible_courses` within the full text
    direct_matches = extract_course_names_from_text(text) # Use original text for context
    for dm in direct_matches:
        identified_courses.append(dm)

    # Then, for lines not directly matched, try similarity or keyword heuristics
    for line_text in potential_course_lines:
        if not line_text or line_text.lower() in stop_words:
            continue
        
        is_known_course = False
        for pc in possible_courses:
            if pc.lower() in line_text.lower(): # Simple substring check here for lines
                if pc not in identified_courses: identified_courses.append(pc)
                is_known_course = True
                break
        
        if not is_known_course:
            # If it contains keywords and isn't just keywords, consider it unverified
            if any(kw in line_text for kw in course_keywords) and not all(word in course_keywords for word in line_text.split()):
                 # Basic check to see if it's a new course or just noise
                if len(line_text.split()) <= 7 and line_text not in identified_courses: # Heuristic: course names usually not too long
                    identified_courses.append(f"{line_text.title()} [UNVERIFIED]")


    return list(set(identified_courses)) # Return unique identified course strings


def query_cohere_llm_for_recommendations(completed_courses_text_list):
    """Queries Cohere LLM for course recommendations."""
    if not co:
        logging.warning("Cohere client not initialized. Skipping LLM recommendations.")
        return "Cohere LLM not available."
    if not completed_courses_text_list:
        return "No completed courses provided to LLM for recommendations."

    prompt = f"""
    The user has completed the following courses or topics, extracted from their certificates: {', '.join(completed_courses_text_list)}.
    Based on these, suggest 2-3 relevant next courses to advance their skills and career.
    For each suggested course:
    - Provide the "Course Name".
    - Provide a concise 1-2 line "Description" of what the course covers and why it's a good next step.
    - Provide a "URL" to a reputable learning platform or resource for that course (e.g., Coursera, freeCodeCamp, official documentation).

    Format each suggestion clearly, like this example:
    Course: Advanced JavaScript
    Description: Deepen your JavaScript knowledge, covering ES6+ features, asynchronous programming, and design patterns. Essential for complex web applications.
    URL: https://www.example.com/advanced-javascript

    If multiple distinct topics were completed, try to provide diverse recommendations.
    If a completed topic seems very niche or too general, try to suggest foundational courses that build upon it or broader skills.
    """
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.6)
        logging.info(f"Cohere LLM raw response: {response.text[:200]}...") # Log snippet
        return response.text.strip()
    except Exception as e:
        logging.error(f"Error querying Cohere LLM: {e}")
        return f"Error from LLM: {str(e)}"


def parse_llm_recommendation_response(llm_response_text):
    """Parses the LLM's text response into a list of structured course recommendations."""
    recommendations = []
    # Split by "Course:" but handle the first one if it doesn't start with it
    raw_blocks = re.split(r'\nCourse:', llm_response_text)
    
    current_recommendation = {}
    for block_text in raw_blocks:
        if not block_text.strip():
            continue

        # If the block doesn't start with "Course:", prepend it for consistent parsing
        # This handles the first block if the split removed the initial "Course:"
        if not block_text.lower().lstrip().startswith("course:"):
             block_to_parse = "Course: " + block_text.strip()
        else:
            block_to_parse = block_text.strip()

        lines = block_to_parse.split('\n')
        rec = {}
        for line in lines:
            line_lower = line.lower()
            if line_lower.startswith("course:"):
                rec["name"] = line.split(":", 1)[-1].strip()
            elif line_lower.startswith("description:"):
                rec["description"] = line.split(":", 1)[-1].strip()
            elif line_lower.startswith("url:"):
                rec["url"] = line.split(":", 1)[-1].strip()
        
        if rec.get("name") and rec.get("description") and rec.get("url"):
            recommendations.append(rec)
            
    return recommendations


def generate_recommendations(user_completed_courses_list):
    """
    Generates recommendations based on completed courses, using course_graph and LLM fallback.
    """
    recommendations_output = []

    # Use a set to avoid redundant graph recommendations for the same course if listed multiple times
    processed_for_graph_rec = set()

    for course_name_full in user_completed_courses_list:
        is_unverified = "[UNVERIFIED]" in course_name_full
        clean_course_name = course_name_full.replace(" [UNVERIFIED]", "").strip()

        if is_unverified:
            # For unverified, we'll rely on the collective LLM call later
            continue 

        if clean_course_name in processed_for_graph_rec:
            continue # Already gave graph recommendation for this

        # 1. Try direct match in course_graph
        if clean_course_name in course_graph:
            entry = course_graph[clean_course_name]
            recommendations_output.append({
                "type": "graph_direct",
                "completed_course": clean_course_name,
                "description": entry["description"],
                "next_courses": entry["next_courses"],
                "url": entry.get("url", "#") # Use .get for safety
            })
            processed_for_graph_rec.add(clean_course_name)
            continue

        # 2. Try similarity match in course_graph
        best_match, score = get_closest_known_course(clean_course_name)
        if best_match and score > 0.75 and best_match in course_graph: # Threshold for good match
            if best_match not in processed_for_graph_rec:
                entry = course_graph[best_match]
                recommendations_output.append({
                    "type": "graph_similar",
                    "completed_course": clean_course_name,
                    "matched_course": best_match,
                    "similarity_score": round(score, 2),
                    "description": entry["description"],
                    "next_courses": entry["next_courses"],
                    "url": entry.get("url", "#")
                })
                processed_for_graph_rec.add(best_match) # Add the matched course
    
    # 3. LLM Fallback for all (especially unverified or ungraphable)
    # Collect all unique, clean course names for the LLM prompt
    all_clean_unique_courses_for_llm = list(set(c.replace(" [UNVERIFIED]", "").strip() for c in user_completed_courses_list if c.replace(" [UNVERIFIED]", "").strip()))
    
    if all_clean_unique_courses_for_llm:
        llm_response_text = query_cohere_llm_for_recommendations(all_clean_unique_courses_for_llm)
        if llm_response_text and not llm_response_text.startswith("Error from LLM") and not llm_response_text.startswith("Cohere LLM not available"):
            parsed_llm_recs = parse_llm_recommendation_response(llm_response_text)
            for rec in parsed_llm_recs:
                recommendations_output.append({
                    "type": "llm",
                    "based_on_courses": all_clean_unique_courses_for_llm,
                    **rec # Spread the name, description, url from parsed rec
                })
        else:
             recommendations_output.append({
                "type": "llm_error",
                "message": llm_response_text
             })

    return recommendations_output


def extract_and_recommend_courses_from_image_data(image_data_list):
    """
    Main processing function for a list of image data objects.
    Each item in image_data_list is a dict: {"bytes": image_bytes, "original_filename": str, "content_type": str}
    """
    all_extracted_raw_texts = []

    for image_data in image_data_list:
        logging.info(f"--- Processing image: {image_data['original_filename']} (Type: {image_data['content_type']}) ---")
        pil_images_to_process = []

        try:
            if image_data['content_type'] == 'application/pdf':
                # Convert PDF bytes to list of PIL Images
                pdf_pages = convert_from_bytes(image_data['bytes'], dpi=300)
                pil_images_to_process.extend(pdf_pages)
                logging.info(f"Converted PDF '{image_data['original_filename']}' to {len(pdf_pages)} image(s).")
            elif image_data['content_type'].startswith('image/'):
                # Convert image bytes to PIL Image
                img_object = Image.open(io.BytesIO(image_data['bytes']))
                pil_images_to_process.append(img_object)
                logging.info(f"Loaded image '{image_data['original_filename']}' from bytes.")
            else:
                logging.warning(f"Unsupported content type '{image_data['content_type']}' for file {image_data['original_filename']}. Skipping.")
                continue
        except UnidentifiedImageError:
            logging.error(f"Cannot identify image file {image_data['original_filename']} (Type: {image_data['content_type']}). It might be corrupted or not a valid image. Skipping.")
            continue
        except Exception as e:
            logging.error(f"Error converting/loading {image_data['original_filename']}: {e}", exc_info=True)
            continue
            
        for i, pil_img in enumerate(pil_images_to_process):
            page_identifier = f"Page {i+1}" if len(pil_images_to_process) > 1 else "Image"
            logging.info(f"Inferring text from {image_data['original_filename']} ({page_identifier})...")
            
            # Ensure image is in RGB format for YOLO/OpenCV compatibility if it has Alpha
            if pil_img.mode == 'RGBA':
                pil_img = pil_img.convert('RGB')
            elif pil_img.mode == 'P': # Palette mode, convert to RGB
                pil_img = pil_img.convert('RGB')
            elif pil_img.mode == 'L': # Grayscale, convert to RGB
                pil_img = pil_img.convert('RGB')


            course_text = infer_course_text_from_image_object(pil_img)
            
            if course_text:
                logging.info(f"Raw extracted text from '{image_data['original_filename']}' ({page_identifier}): '{course_text[:100]}...'")
                all_extracted_raw_texts.append(course_text)
            else:
                logging.warning(f"No significant text extracted from '{image_data['original_filename']}' ({page_identifier}).")

    # Normalize and get unique course texts
    # Each item in all_extracted_raw_texts might contain multiple course mentions or be a full OCR dump
    processed_course_mentions = []
    for raw_text_blob in all_extracted_raw_texts:
        # Filter_and_verify attempts to find actual course titles within the raw OCR text
        filtered = filter_and_verify_course_text(raw_text_blob)
        if filtered:
            processed_course_mentions.extend(filtered)
            logging.info(f"Filtered/Verified from text blob '{raw_text_blob[:50]}...': {filtered}")
        else:
            logging.info(f"No specific courses identified in text blob: '{raw_text_blob[:50]}...'")


    unique_final_course_list = sorted(list(set(processed_course_mentions)))
    logging.info(f"Final unique list of identified courses/topics: {unique_final_course_list}")

    # Generate recommendations based on this unique list
    recommendations = generate_recommendations(unique_final_course_list)

    return {
        "extracted_courses": unique_final_course_list,
        "recommendations": recommendations
    }


# Example of how to use the main function (for local testing if needed)
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # This local test requires images in a 'test_images' folder.
    # It's different from how Flask will call it.
    test_image_folder = "test_images" 
    if not os.path.exists(test_image_folder):
        os.makedirs(test_image_folder)
        print(f"Created '{test_image_folder}'. Please add test images (PDF, PNG, JPG) there to run this local test.")
        exit()

    test_data = []
    for f_name in os.listdir(test_image_folder):
        f_path = os.path.join(test_image_folder, f_name)
        if os.path.isfile(f_path):
            with open(f_path, "rb") as f:
                img_bytes = f.read()
            
            content_type = "application/octet-stream"
            if f_name.lower().endswith(".pdf"): content_type = "application/pdf"
            elif f_name.lower().endswith((".png", ".jpg", ".jpeg")): content_type = f"image/{f_name.split('.')[-1].lower()}"
            
            test_data.append({
                "bytes": img_bytes,
                "original_filename": f_name,
                "content_type": content_type
            })
    
    if test_data:
        print(f"Locally testing with {len(test_data)} images from '{test_image_folder}'...")
        results = extract_and_recommend_courses_from_image_data(test_data)
        print("\n\n=== FINAL RESULTS (Local Test) ===")
        print(json.dumps(results, indent=2))
    else:
        print(f"No images found in '{test_image_folder}' to test.")
