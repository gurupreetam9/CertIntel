
import logging
import os
import cv2
import pytesseract
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO
from pdf2image import convert_from_bytes
import numpy as np
import re
import nltk
from nltk.corpus import words as nltk_words, stopwords
from sentence_transformers import SentenceTransformer, util
import cohere
from difflib import SequenceMatcher
import json
import io

# --- Initial Setup ---
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
COHERE_API_KEY = os.getenv("COHERE_API_KEY")

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
}

YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "best.pt") # Default to 'best.pt' in current dir if not set
model = None
try:
    if os.path.exists(YOLO_MODEL_PATH):
        model = YOLO(YOLO_MODEL_PATH)
        logging.info(f"Successfully loaded YOLO model from: {YOLO_MODEL_PATH}")
    else:
        script_dir_model_path = os.path.join(os.path.dirname(__file__), 'best.pt')
        if os.path.exists(script_dir_model_path) and YOLO_MODEL_PATH == "best.pt":
             model = YOLO(script_dir_model_path)
             logging.info(f"Successfully loaded YOLO model from script directory: {script_dir_model_path}")
        else:
            logging.error(f"YOLO model not found at path: {YOLO_MODEL_PATH} or in script directory. Please check the path or set YOLO_MODEL_PATH.")
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
    if not model:
        logging.error("YOLO model is not loaded. Cannot infer course text.")
        return None
    try:
        image_np = np.array(pil_image_obj)
        if image_np.shape[2] == 4:
             image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)

        results = model(image_np)
        names = results[0].names
        boxes = results[0].boxes

        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                label = names[cls_id]
                if label.lower() in ["certificatecourse", "course", "title", "name"]:
                    left, top, right, bottom = map(int, box.xyxy[0].cpu().numpy())
                    cropped_pil_image = pil_image_obj.crop((left, top, right, bottom))
                    text = pytesseract.image_to_string(cropped_pil_image).strip()
                    cleaned_text = clean_unicode(text)
                    if cleaned_text:
                        logging.info(f"Extracted text from detected region ('{label}'): '{cleaned_text}'")
                        return cleaned_text
        else:
            logging.warning("No relevant bounding boxes detected by YOLO.")

        logging.info("No specific course region found, attempting OCR on the whole image as fallback.")
        full_image_text = pytesseract.image_to_string(pil_image_obj).strip()
        cleaned_full_text = clean_unicode(full_image_text)
        if cleaned_full_text:
            logging.info(f"Extracted text from full image (fallback): '{cleaned_full_text[:100]}...'")
            return cleaned_full_text
        return None
    except Exception as e:
        logging.error(f"Error during YOLO inference or OCR: {e}", exc_info=True)
        return None

def extract_course_names_from_text(text):
    if not text: return []
    found_courses = []
    text_lower = text.lower()
    for course in possible_courses:
        if re.search(r'\b' + re.escape(course.lower()) + r'\b', text_lower):
            found_courses.append(course)
    return list(set(found_courses))

def get_closest_known_course(unknown_course_text):
    if not sentence_model:
        logging.error("Sentence model not loaded. Cannot find closest course.")
        return None, 0.0
    known_course_names = list(course_graph.keys())
    if not known_course_names: return None, 0.0
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
    if not text or len(text) < 3:
        return []
    phrases_to_remove = ["certificate of completion", "certificate of achievement", "is awarded to", "has successfully completed"]
    temp_text = text.lower()
    for phrase in phrases_to_remove:
        temp_text = temp_text.replace(phrase, "")
    potential_course_lines = [line.strip() for line in temp_text.split('\n') if len(line.strip()) > 4]
    identified_courses = []
    direct_matches = extract_course_names_from_text(text)
    for dm in direct_matches:
        identified_courses.append(dm)
    for line_text in potential_course_lines:
        if not line_text or line_text.lower() in stop_words:
            continue
        is_known_course = False
        for pc in possible_courses:
            if pc.lower() in line_text.lower():
                if pc not in identified_courses: identified_courses.append(pc)
                is_known_course = True
                break
        if not is_known_course:
            if any(kw in line_text for kw in course_keywords) and not all(word in course_keywords for word in line_text.split()):
                if len(line_text.split()) <= 7 and line_text not in identified_courses:
                    identified_courses.append(f"{line_text.title()} [UNVERIFIED]")
    return list(set(identified_courses))

def query_cohere_llm_for_recommendations(completed_courses_text_list):
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
    IMPORTANT: Do not recommend any of the courses the user has already completed: {', '.join(completed_courses_text_list)}.
    """
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.6)
        logging.info(f"Cohere LLM raw response: {response.text[:200]}...")
        return response.text.strip()
    except Exception as e:
        logging.error(f"Error querying Cohere LLM: {e}")
        return f"Error from LLM: {str(e)}"

def parse_llm_recommendation_response(llm_response_text):
    recommendations = []
    raw_blocks = re.split(r'\nCourse:', llm_response_text)
    for block_text in raw_blocks:
        if not block_text.strip(): continue
        block_to_parse = "Course: " + block_text.strip() if not block_text.lower().lstrip().startswith("course:") else block_text.strip()
        lines = block_to_parse.split('\n')
        rec = {}
        for line in lines:
            line_lower = line.lower()
            if line_lower.startswith("course:"): rec["name"] = line.split(":", 1)[-1].strip()
            elif line_lower.startswith("description:"): rec["description"] = line.split(":", 1)[-1].strip()
            elif line_lower.startswith("url:"): rec["url"] = line.split(":", 1)[-1].strip()
        if rec.get("name") and rec.get("description") and rec.get("url"):
            recommendations.append(rec)
    return recommendations

def generate_recommendations(user_completed_courses_list, previous_results_list=None):
    recommendations_output = []
    processed_courses = set()
    llm_candidate_courses = []
    
    # Normalize the user_completed_courses_list for easier checking
    # We'll use the clean names (without "[UNVERIFIED]") for filtering suggestions
    normalized_completed_set = set(c.replace(" [UNVERIFIED]", "").strip().lower() for c in user_completed_courses_list)

    for course_name_full in user_completed_courses_list:
        is_unverified = "[UNVERIFIED]" in course_name_full
        clean_course_name = course_name_full.replace(" [UNVERIFIED]", "").strip()
        if not clean_course_name or clean_course_name in processed_courses:
            continue

        cached_graph_recommendation = None
        if previous_results_list:
            for prev_result_doc in previous_results_list:
                actual_prev_recommendations = prev_result_doc.get('recommendations', []) if isinstance(prev_result_doc, dict) else []
                for prev_rec in actual_prev_recommendations:
                    rec_type = prev_rec.get('type', '')
                    if rec_type.startswith('graph_') or rec_type.startswith('cached_graph_'):
                        if prev_rec.get('completed_course') == clean_course_name or prev_rec.get('matched_course') == clean_course_name:
                            # Filter next_courses from cache against currently completed courses
                            filtered_next_courses = [
                                nc for nc in prev_rec.get("next_courses", [])
                                if nc.lower() not in normalized_completed_set
                            ]
                            if filtered_next_courses or not prev_rec.get("next_courses"): # Keep if next_courses was empty or still has items
                                cached_graph_recommendation = {**prev_rec, "next_courses": filtered_next_courses, "type": f"cached_{rec_type}"}
                            break
                if cached_graph_recommendation:
                    break
        
        if cached_graph_recommendation:
            if cached_graph_recommendation.get("next_courses"): # Only add if there are still suggestions
                recommendations_output.append(cached_graph_recommendation)
            processed_courses.add(clean_course_name)
            if matched := cached_graph_recommendation.get('matched_course'): processed_courses.add(matched)
            logging.info(f"Using cached graph-like recommendation for '{clean_course_name}'.")
            continue

        if clean_course_name in course_graph:
            entry = course_graph[clean_course_name]
            # Filter next_courses against all user's completed courses
            filtered_next_courses = [
                nc for nc in entry["next_courses"]
                if nc.lower() not in normalized_completed_set
            ]
            if filtered_next_courses: # Only add recommendation if there are suggestions left
                recommendations_output.append({
                    "type": "graph_direct", "completed_course": clean_course_name,
                    "description": entry["description"], "next_courses": filtered_next_courses,
                    "url": entry.get("url", "#")
                })
            processed_courses.add(clean_course_name)
            continue

        if not is_unverified:
            best_match, score = get_closest_known_course(clean_course_name)
            if best_match and score > 0.75 and best_match in course_graph:
                entry = course_graph[best_match]
                 # Filter next_courses against all user's completed courses
                filtered_next_courses = [
                    nc for nc in entry["next_courses"]
                    if nc.lower() not in normalized_completed_set
                ]
                if filtered_next_courses: # Only add recommendation if there are suggestions left
                    recommendations_output.append({
                        "type": "graph_similar", "completed_course": clean_course_name,
                        "matched_course": best_match, "similarity_score": round(score, 2),
                        "description": entry["description"], "next_courses": filtered_next_courses,
                        "url": entry.get("url", "#")
                    })
                processed_courses.add(clean_course_name)
                processed_courses.add(best_match)
                continue
        
        llm_candidate_courses.append(course_name_full)

    unique_llm_inputs = list(set(c.replace(" [UNVERIFIED]", "").strip() for c in llm_candidate_courses if c.replace(" [UNVERIFIED]", "").strip()))
    
    # Prepare the full list of already completed courses for the LLM prompt
    # This ensures the LLM is explicitly told not to re-suggest these
    llm_completed_courses_for_prompt = [c.replace(" [UNVERIFIED]", "").strip() for c in user_completed_courses_list]

    if unique_llm_inputs: # Only call LLM if there are courses that weren't handled by graph
        llm_input_key = tuple(sorted(unique_llm_inputs))
        cached_llm_rec_list = None
        if previous_results_list:
            for prev_result_doc in previous_results_list:
                actual_prev_recommendations = prev_result_doc.get('recommendations', [])
                for prev_rec in actual_prev_recommendations:
                    if (prev_rec.get('type', '').startswith('llm') or prev_rec.get('type', '').startswith('cached_llm')) and \
                       tuple(sorted(prev_rec.get('based_on_courses', []))) == llm_input_key:
                        
                        # Filter cached LLM recommendations against currently completed courses
                        filtered_llm_recs_from_cache = [
                            r for r in actual_prev_recommendations
                            if (r.get('type','').startswith('llm') or r.get('type','').startswith('cached_llm')) and \
                               tuple(sorted(r.get('based_on_courses', []))) == llm_input_key and \
                               (r.get("name", "").lower() not in normalized_completed_set)
                        ]
                        if filtered_llm_recs_from_cache:
                             cached_llm_rec_list = filtered_llm_recs_from_cache
                        break 
                if cached_llm_rec_list:
                    break
        
        if cached_llm_rec_list:
            logging.info(f"Using cached and filtered LLM recommendations for input set: {llm_input_key}")
            for rec in cached_llm_rec_list:
                recommendations_output.append({**rec, "type": f"cached_{rec.get('type', 'llm')}"})
        else:
            logging.info(f"Querying LLM for input set: {llm_input_key}, with completed list: {llm_completed_courses_for_prompt}")
            # Pass the full list of completed courses to the LLM query function
            llm_response_text = query_cohere_llm_for_recommendations(llm_completed_courses_for_prompt) # Changed input here
            
            if llm_response_text and not llm_response_text.startswith("Error from LLM") and not llm_response_text.startswith("Cohere LLM not available"):
                parsed_llm_recs = parse_llm_recommendation_response(llm_response_text)
                for rec_data in parsed_llm_recs:
                    # Also filter newly parsed LLM recs, just in case LLM didn't fully respect the prompt
                    if rec_data.get("name", "").lower() not in normalized_completed_set:
                        recommendations_output.append({
                            "type": "llm",
                            "based_on_courses": unique_llm_inputs, # For caching, based on what triggered this specific LLM call
                            **rec_data 
                        })
            else: 
                recommendations_output.append({
                    "type": "llm_error", 
                    "message": llm_response_text, 
                    "based_on_courses": unique_llm_inputs
                })
                
    return recommendations_output

def extract_and_recommend_courses_from_image_data(
    image_data_list, 
    previous_results_list=None,
    additional_manual_courses=None 
):
    all_extracted_raw_texts = []
    for image_data in image_data_list:
        logging.info(f"--- Processing image: {image_data['original_filename']} (Type: {image_data['content_type']}) ---")
        pil_images_to_process = []
        try:
            if image_data['content_type'] == 'application/pdf':
                pdf_pages = convert_from_bytes(image_data['bytes'], dpi=300)
                pil_images_to_process.extend(pdf_pages)
                logging.info(f"Converted PDF '{image_data['original_filename']}' to {len(pdf_pages)} image(s).")
            elif image_data['content_type'].startswith('image/'):
                img_object = Image.open(io.BytesIO(image_data['bytes']))
                pil_images_to_process.append(img_object)
                logging.info(f"Loaded image '{image_data['original_filename']}' from bytes.")
            else:
                logging.warning(f"Unsupported content type '{image_data['content_type']}' for file {image_data['original_filename']}. Skipping.")
                continue
        except UnidentifiedImageError:
            logging.error(f"Cannot identify image file {image_data['original_filename']}. Skipping.")
            continue
        except Exception as e:
            logging.error(f"Error converting/loading {image_data['original_filename']}: {e}", exc_info=True)
            continue
            
        for i, pil_img in enumerate(pil_images_to_process):
            page_identifier = f"Page {i+1}" if len(pil_images_to_process) > 1 else "Image"
            logging.info(f"Inferring text from {image_data['original_filename']} ({page_identifier})...")
            if pil_img.mode == 'RGBA': pil_img = pil_img.convert('RGB')
            elif pil_img.mode == 'P': pil_img = pil_img.convert('RGB')
            elif pil_img.mode == 'L': pil_img = pil_img.convert('RGB')

            course_text = infer_course_text_from_image_object(pil_img)
            if course_text:
                logging.info(f"Raw extracted text from '{image_data['original_filename']}' ({page_identifier}): '{course_text[:100]}...'")
                all_extracted_raw_texts.append(course_text)
            else:
                logging.warning(f"No significant text extracted from '{image_data['original_filename']}' ({page_identifier}).")

    processed_course_mentions = []
    for raw_text_blob in all_extracted_raw_texts:
        filtered = filter_and_verify_course_text(raw_text_blob)
        if filtered:
            processed_course_mentions.extend(filtered)
            logging.info(f"Filtered/Verified from text blob '{raw_text_blob[:50]}...': {filtered}")
        else:
            logging.info(f"No specific courses identified in text blob: '{raw_text_blob[:50]}...'")

    unique_final_course_list = sorted(list(set(processed_course_mentions)))
    
    if additional_manual_courses:
        logging.info(f"Original extracted unique courses: {unique_final_course_list}")
        for manual_course in additional_manual_courses:
            clean_manual_course = manual_course.strip()
            if clean_manual_course and clean_manual_course not in unique_final_course_list:
                unique_final_course_list.append(clean_manual_course)
        unique_final_course_list = sorted(list(set(unique_final_course_list))) 
        logging.info(f"Merged with manual courses. Final list for recommendations: {unique_final_course_list}")


    logging.info(f"Final list of courses/topics for recommendations: {unique_final_course_list}")
    recommendations = generate_recommendations(unique_final_course_list, previous_results_list=previous_results_list)
    return {"extracted_courses": unique_final_course_list, "recommendations": recommendations}

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    test_image_folder = "test_images" 
    if not os.path.exists(test_image_folder):
        os.makedirs(test_image_folder)
        print(f"Created '{test_image_folder}'. Add test images there.")
        exit()
    test_data = []
    for f_name in os.listdir(test_image_folder):
        f_path = os.path.join(test_image_folder, f_name)
        if os.path.isfile(f_path):
            with open(f_path, "rb") as f: img_bytes = f.read()
            content_type = "application/octet-stream"
            if f_name.lower().endswith(".pdf"): content_type = "application/pdf"
            elif f_name.lower().endswith((".png", ".jpg", ".jpeg")): content_type = f"image/{f_name.split('.')[-1].lower()}"
            test_data.append({"bytes": img_bytes, "original_filename": f_name, "content_type": content_type})
    if test_data:
        print(f"Locally testing with {len(test_data)} images from '{test_image_folder}'...")
        
        mock_previous_results = []
        mock_manual_courses = [] 
        
        results = extract_and_recommend_courses_from_image_data(
            test_data, 
            previous_results_list=mock_previous_results, 
            additional_manual_courses=mock_manual_courses
        )
        print("\n\n=== FINAL RESULTS (Local Test) ===")
        print(json.dumps(results, indent=2))
    else:
        print(f"No images found in '{test_image_folder}' to test.")

# Ensure YOLO_MODEL_PATH is correct or 'best.pt' is in the right place.
# Example: YOLO_MODEL_PATH=./models/best.pt python certificate_processor.py
# If 'best.pt' is one level up: YOLO_MODEL_PATH=../best.pt python certificate_processor.py
# To use environment variable: export YOLO_MODEL_PATH=/path/to/your/model/best.pt
# then run: python certificate_processor.py
# Make sure your Cohere API key is also set in environment or directly in script for testing.


