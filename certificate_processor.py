
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
import shutil # For shutil.which

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
    # Add more courses to the graph as needed
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
        if image_np.shape[2] == 4: # Handle RGBA images by converting to RGB
             image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)

        results = model(image_np) # Perform inference
        names = results[0].names # Class names
        boxes = results[0].boxes # Bounding boxes

        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                label = names[cls_id]
                if label.lower() in ["certificatecourse", "course", "title", "name"]: # Check if label is relevant
                    left, top, right, bottom = map(int, box.xyxy[0].cpu().numpy())
                    cropped_pil_image = pil_image_obj.crop((left, top, right, bottom))
                    text = pytesseract.image_to_string(cropped_pil_image).strip()
                    cleaned_text = clean_unicode(text)
                    if cleaned_text:
                        logging.info(f"Extracted text from detected region ('{label}'): '{cleaned_text}'")
                        return cleaned_text # Return text from first relevant region
        else:
            logging.warning("No relevant bounding boxes detected by YOLO.")

        # Fallback to OCR on the whole image if no specific region was found or text extracted
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
    return list(set(found_courses)) # Return unique courses

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

    # First, add direct matches from the known course list
    direct_matches = extract_course_names_from_text(text) # Use original text for direct matching
    for dm in direct_matches:
        identified_courses.append(dm)
        
    # Then, process lines for other potential courses
    for line_text in potential_course_lines:
        if not line_text or line_text.lower() in stop_words:
            continue

        is_known_course = False
        for pc in possible_courses: # Check against possible_courses list
            if pc.lower() in line_text.lower(): # Simpler check if line contains a known course name
                if pc not in identified_courses: identified_courses.append(pc)
                is_known_course = True
                break 
        
        if not is_known_course:
            # If not a direct known course, check for keywords and basic structure
            if any(kw in line_text for kw in course_keywords) and not all(word in course_keywords for word in line_text.split()):
                # Basic filter: reasonable length, not just keywords
                if len(line_text.split()) <= 7 and line_text not in identified_courses:
                    identified_courses.append(f"{line_text.title()} [UNVERIFIED]")
                    
    return list(set(identified_courses)) # Return unique courses

def query_cohere_llm_for_recommendations(completed_courses_text_list):
    if not co:
        logging.warning("Cohere client not initialized. Skipping LLM recommendations.")
        return "Cohere LLM not available."
    if not completed_courses_text_list:
        logging.warning("No completed courses provided to LLM for recommendations. Returning canned response.")
        return "No completed courses provided to LLM for recommendations."

    prompt = f"""
        You are given a list of course names that the user has completed: {', '.join(completed_courses_text_list)}.
        For each course, suggest 2-3 relevant next courses that would build upon it.
        
        IMPORTANT: Your response MUST include only the extracted course and the suggestions.
        Each block must start with:
        - "Completed Course: [Name of completed course]"
        - Followed by lines in this format for each suggested course:
          - "Suggested Course: [Next Course Name]"
          - "URL: [Link to take this suggested course]"
        
        Do NOT include any descriptions, summaries, or additional explanation.
        Do NOT include URLs for the completed courses.
        Do NOT repeat completed courses as suggestions.
        
        Example format:
        Completed Course: Python
        Suggested Course: Flask
        URL: https://flask.palletsprojects.com/
        Suggested Course: Django
        URL: https://www.djangoproject.com/
        Suggested Course: Data Science
        URL: https://www.coursera.org/specializations/data-science
        
        Repeat this format for each course in the completed list. If no suggestion is relevant, respond with:
        Completed Course: [Course Name]
        Suggested Course: None
        """
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.3) 
        logging.info(f"Cohere LLM raw response: {response.text[:500]}...")
        return response.text.strip()
    except Exception as e:
        logging.error(f"Error querying Cohere LLM: {e}")
        return f"Error from LLM: {str(e)}"

def parse_llm_recommendation_response(llm_response_text):
    recommendations = []
    if not llm_response_text or \
       llm_response_text.strip().lower() == "cohere llm not available." or \
       llm_response_text.strip().lower().startswith("error from llm:") or \
       llm_response_text.strip().lower() == "no completed courses provided to llm for recommendations.":
        logging.warning(f"LLM response is empty, an error, or indicates no courses were provided: {llm_response_text}")
        return recommendations

    # Strip leading list-like characters (e.g., '-', '*') and outer whitespace
    cleaned_response_text = re.sub(r"^\s*[-\*\d\.\)]+\s*", "", llm_response_text.strip())
    logging.info(f"LLM Parser: Cleaned response text (first 100 chars): '{cleaned_response_text[:100]}'")

    # Split the entire response into blocks, where each block starts with "Completed Course:"
    raw_blocks = re.split(r"(?=Completed Course:)", cleaned_response_text)
    logging.info(f"LLM Parser: Split into {len(raw_blocks)} raw_blocks. First block preview: '{raw_blocks[0][:100] if raw_blocks else 'N/A'}'...")

    for raw_block in raw_blocks:
        block_text = raw_block.strip()
        if not block_text.startswith("Completed Course:"):
            if block_text: 
                logging.warning(f"LLM Parser: Skipping unexpected text segment in LLM response: '{block_text[:100]}...'")
            continue
            
        completed_course_line_match = re.match(r"Completed Course:\s*(.*?)(?:\n|$)", block_text, re.IGNORECASE)
        if not completed_course_line_match:
            logging.warning(f"LLM Parser: Could not parse completed course from start of block: '{block_text[:100]}'")
            continue
        
        original_completed_course_name = completed_course_line_match.group(1).strip()
        if not original_completed_course_name:
            logging.warning(f"LLM Parser: Empty completed course name parsed from block start: '{block_text[:100]}'")
            continue
        
        logging.info(f"LLM Parser: Processing suggestions for completed course: '{original_completed_course_name}'")
        
        # Use regex to find all "Suggested Course: ... URL: ..." pairs within the current block_text
        # This regex looks for "Suggested Course:", captures the name, then looks for "URL:", and captures the URL.
        # It allows various separators (newlines, hyphens, spaces) between the course name and "URL:".
        suggestions_in_block = re.findall(
            r"Suggested Course:\s*(.*?)(?:\s*\n+\s*|\s*-\s*|\s+)URL:\s*(https?://\S+)",
            block_text, # Search within the current block
            re.IGNORECASE | re.DOTALL # DOTALL allows . to match newlines if course name spans lines
        )
        
        logging.info(f"LLM Parser: Found {len(suggestions_in_block)} suggestions in block for '{original_completed_course_name}' using regex. Suggestions: {suggestions_in_block}")

        if not suggestions_in_block: # Check for "Suggested Course: None" if regex found nothing
            if re.search(r"Suggested Course:\s*None", block_text, re.IGNORECASE):
                 logging.info(f"LLM Parser: LLM indicated 'None' for completed course: '{original_completed_course_name}' (found by fallback).")
                 continue # Move to the next block

        for suggested_name, url in suggestions_in_block:
            suggested_name = suggested_name.strip()
            url = url.strip()

            # The "Suggested Course: None" case should ideally be caught by the regex if it's the only suggestion.
            # However, if it's mixed or the regex fails for it, this direct check can be a fallback.
            if suggested_name.lower() == "none":
                logging.info(f"LLM Parser: LLM indicated 'None' for completed course: '{original_completed_course_name}' (parsed from regex match).")
                continue # Skip this specific "None" suggestion

            if suggested_name and url: # URL already validated by regex to start with http/https
                recommendations.append({
                    "original_completed_course": original_completed_course_name,
                    "name": suggested_name,
                    "url": url,
                    "description": "", # Description not part of this new prompt format
                    "next_courses": [], # next_courses not part of this new prompt format for sub-suggestions
                })
                logging.info(f"LLM Parser: Added suggestion: '{suggested_name}' with URL for '{original_completed_course_name}'")
            elif suggested_name:
                logging.warning(f"LLM Parser: Suggestion '{suggested_name}' (based on '{original_completed_course_name}') found by regex but URL was invalid or not captured. URL part: '{url}'. Skipping this suggestion.")
    
    if not recommendations and cleaned_response_text and (raw_blocks[0].strip() if raw_blocks and raw_blocks[0] else "").startswith("Completed Course:"):
        logging.warning(f"LLM Parser: LLM response was non-empty and seemed to contain course blocks, but no recommendations were successfully parsed. Cleaned text fragment: {cleaned_response_text[:500]}...")
        
    return recommendations


def generate_recommendations(user_completed_courses_list, previous_results_list=None):
    recommendations_output = []
    processed_courses_for_graph = set() 
    
    normalized_completed_set = set(c.replace(" [UNVERIFIED]", "").strip().lower() for c in user_completed_courses_list)

    # Process Graph-based recommendations first
    for course_name_full in user_completed_courses_list:
        is_unverified = "[UNVERIFIED]" in course_name_full
        clean_course_name = course_name_full.replace(" [UNVERIFIED]", "").strip()

        if not clean_course_name or clean_course_name in processed_courses_for_graph:
            continue

        if clean_course_name in course_graph: 
            entry = course_graph[clean_course_name]
            filtered_next_courses = [
                nc for nc in entry.get("next_courses", [])
                if nc.lower() not in normalized_completed_set 
            ]
            recommendations_output.append({
                "type": "graph_direct", "completed_course": clean_course_name,
                "description": entry["description"], "next_courses": filtered_next_courses,
                "url": entry.get("url", "#"), 
                "next_courses_defined_in_graph": bool(entry.get("next_courses")) 
            })
            processed_courses_for_graph.add(clean_course_name)
            continue 

        if not is_unverified: 
            best_match, score = get_closest_known_course(clean_course_name)
            if best_match and score > 0.75 and best_match in course_graph: 
                entry = course_graph[best_match]
                filtered_next_courses = [
                    nc for nc in entry.get("next_courses", [])
                    if nc.lower() not in normalized_completed_set 
                ]
                recommendations_output.append({
                    "type": "graph_similar", "completed_course": clean_course_name,
                    "matched_course": best_match, "similarity_score": round(score, 2),
                    "description": entry["description"], "next_courses": filtered_next_courses,
                    "url": entry.get("url", "#"), 
                    "next_courses_defined_in_graph": bool(entry.get("next_courses"))
                })
                processed_courses_for_graph.add(clean_course_name)
                processed_courses_for_graph.add(best_match) 
                continue 
    
    unique_llm_prompt_context_courses = sorted(list(set(c.replace(" [UNVERIFIED]", "").strip() for c in user_completed_courses_list)))
    llm_results_appended = False # Flag to track if any LLM result (success or specific error) was added

    if unique_llm_prompt_context_courses:
        logging.info(f"Querying LLM with context: {unique_llm_prompt_context_courses}")
        llm_response_text = query_cohere_llm_for_recommendations(unique_llm_prompt_context_courses)
        
        is_llm_error_response = not llm_response_text or \
                                llm_response_text.strip().lower().startswith("error from llm:") or \
                                llm_response_text.strip().lower() == "cohere llm not available." or \
                                llm_response_text.strip().lower() == "no completed courses provided to llm for recommendations."

        parsed_llm_recs = []
        if not is_llm_error_response:
            logging.info(f"Attempting to parse LLM response: '{llm_response_text[:500]}...'")
            parsed_llm_recs = parse_llm_recommendation_response(llm_response_text)
            
            if parsed_llm_recs:
                for rec_data in parsed_llm_recs:
                    # Ensure original_completed_course is key for display context
                    original_completed = rec_data.get("original_completed_course")
                    suggested_course_name = rec_data.get("name")

                    # Filter out suggestions that are already completed by the user
                    if suggested_course_name and original_completed and suggested_course_name.lower().strip() not in normalized_completed_set:
                        recommendations_output.append({
                            "type": "llm", 
                            "completed_course": original_completed, # The user's course that this suggestion is FOR
                            "name": suggested_course_name,         # The actual suggested course by LLM
                            "url": rec_data.get("url"),            # URL for the suggested course
                            "description": rec_data.get("description", ""), # Description for the suggested_course_name
                            "next_courses": rec_data.get("next_courses", []), # Further next_courses for suggested_course_name
                        })
                        llm_results_appended = True 
                    elif suggested_course_name: 
                        logging.info(f"LLM suggested course '{suggested_course_name}' (based on '{original_completed}') which is already in user's completed list or was empty/invalid. Skipping.")
                
                if not llm_results_appended and parsed_llm_recs: # Parser found items, but all were filtered
                    logging.info(f"LLM parser returned {len(parsed_llm_recs)} items, but all were filtered out (e.g. duplicates or missing required fields).")
                    # If all parsed items were filtered, we still consider it a "parsing attempt occurred"
            # If parsed_llm_recs is empty (parser found nothing), llm_results_appended remains False.

        # If after attempting LLM processing (query and parse), no successful LLM recommendations were added:
        if not llm_results_appended:
            error_message_for_output = "LLM processing did not yield any new recommendations."
            if is_llm_error_response:
                error_message_for_output = llm_response_text or "LLM query returned an empty or null response."
                logging.warning(f"LLM query itself failed or returned unusable response for context {unique_llm_prompt_context_courses}. Response: '{llm_response_text}'")
            elif not parsed_llm_recs: # Executed only if is_llm_error_response was false, but parsing still failed
                error_message_for_output = f"LLM response was received ('{llm_response_text[:100]}...'), but no valid recommendations could be parsed. Check server logs for details."
                logging.warning(f"LLM response parsing yielded no recommendations for input: {unique_llm_prompt_context_courses}. Raw response was: {llm_response_text[:500]}...")
            
            logging.info(f"Appending LLM error/info to output. Message: {error_message_for_output}")
            recommendations_output.append({
                "type": "llm_error", 
                "message": error_message_for_output,
                "completed_course": ", ".join(unique_llm_prompt_context_courses), # Context for the error
                "name": "LLM Status", # Generic name for error/status entries
                "url": "#" 
            })
            # llm_results_appended = True # Mark that an error object was appended
            
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
                if not os.getenv("POPPLER_PATH") and not shutil.which("pdftoppm"):
                    logging.error("Poppler not found. POPPLER_PATH not set and pdftoppm not in PATH. Cannot convert PDF.")
                    continue 
                
                pdf_pages = convert_from_bytes(image_data['bytes'], dpi=300, poppler_path=os.getenv("POPPLER_PATH"))
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
            if "poppler" in str(e).lower():
                 logging.critical("Poppler utilities might not be installed or found. Please install Poppler and ensure it's in your PATH or set POPPLER_PATH environment variable.")
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
                if not "[UNVERIFIED]" in clean_manual_course.upper():
                    unique_final_course_list.append(clean_manual_course)
                else: 
                    unique_final_course_list.append(clean_manual_course)

        unique_final_course_list = sorted(list(set(unique_final_course_list))) 
        logging.info(f"Merged with manual courses. Final list for recommendations: {unique_final_course_list}")


    logging.info(f"Final list of courses/topics for recommendations: {unique_final_course_list}")

    recommendations = generate_recommendations(unique_final_course_list, previous_results_list=previous_results_list)
    
    return {"extracted_courses": unique_final_course_list, "recommendations": recommendations}

# --- Main (for local testing) ---
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    test_image_folder = "test_images" 
    if not os.path.exists(test_image_folder):
        os.makedirs(test_image_folder)
        print(f"Created '{test_image_folder}'. Add test images (JPG, PNG, PDF) there to run local test.")
        try:
            from reportlab.pdfgen import canvas as rcanvas
            from reportlab.lib.pagesizes import letter
            dummy_pdf_path = os.path.join(test_image_folder, "dummy_test.pdf")
            if not os.path.exists(dummy_pdf_path):
                c = rcanvas.Canvas(dummy_pdf_path, pagesize=letter)
                c.drawString(100, 750, "Test PDF for Poppler check.")
                c.drawString(100, 730, "Course: Introduction to Testing")
                c.save()
                print(f"Created dummy PDF: {dummy_pdf_path}")
        except ImportError:
            print("reportlab not found, cannot create dummy PDF for testing.")

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
        mock_manual_courses = ["Advanced Data Analysis", "TensorFlow Basics", "CSS"] 
        
        has_pdfs = any(d['content_type'] == 'application/pdf' for d in test_data)
        if has_pdfs:
            pop_path_env = os.getenv("POPPLER_PATH")
            pop_in_sys_path = shutil.which("pdftoppm") or shutil.which("pdfinfo")
            if not pop_path_env and not pop_in_sys_path:
                print("\n\n" + "="*30)
                print("WARNING: Poppler utilities (e.g., pdftoppm) not found in system PATH and POPPLER_PATH environment variable is not set.")
                print("PDF processing will likely fail. Please install Poppler or set POPPLER_PATH.")
                print("="*30 + "\n\n")
            else:
                print(f"Poppler check: POPPLER_PATH='{pop_path_env}', pdftoppm in PATH='{pop_in_sys_path}'")


        results = extract_and_recommend_courses_from_image_data(
            test_data, 
            previous_results_list=mock_previous_results, 
            additional_manual_courses=mock_manual_courses
        )
        
        print("\n\n=== FINAL RESULTS (Local Test) ===")
        print(json.dumps(results, indent=2))
    else:
        print(f"No images found in '{test_image_folder}' to test.")

    

    