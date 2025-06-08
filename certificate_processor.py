
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
# from sentence_transformers import SentenceTransformer, util # Currently unused, consider re-adding if semantic search needed
import cohere
# from difflib import SequenceMatcher # Currently unused
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
        "next_courses_for_graph_display_only": ["CSS", "JavaScript"], # This field is now less relevant with new LLM structure
        "url": "https://www.freecodecamp.org/learn/responsive-web-design/"
    },
    "CSS": {
        "description": "CSS (Cascading Style Sheets) is used to style and layout web pages.",
        "next_courses_for_graph_display_only": ["JavaScript", "Tailwind CSS", "React"],
        "url": "https://developer.mozilla.org/en-US/docs/Web/CSS"
    },
    "JavaScript": {
        "description": "JavaScript adds interactivity to websites and is essential for frontend development.",
        "next_courses_for_graph_display_only": ["React", "Node.js", "Vue.js", "Angular"],
        "url": "https://www.javascript.info/"
    },
    "Python": {
        "description": "Python is a versatile programming language used in web, AI, and automation.",
        "next_courses_for_graph_display_only": ["Flask", "Django", "Machine Learning", "Data Science"],
        "url": "https://www.learnpython.org/"
    },
    "React": {
        "description": "React is a popular JavaScript library for building interactive UIs.",
        "next_courses_for_graph_display_only": ["Next.js", "Remix", "Redux", "GraphQL"],
        "url": "https://react.dev/"
    },
    "Flask": {
        "description": "Flask is a lightweight Python web framework great for small web apps.",
        "next_courses_for_graph_display_only": ["Docker", "SQLAlchemy", "REST APIs"],
        "url": "https://flask.palletsprojects.com/"
    },
    "Django": {
        "description": "Django is a high-level Python web framework that encourages rapid development.",
        "next_courses_for_graph_display_only": ["Django REST framework", "Celery", "PostgreSQL"],
        "url": "https://www.djangoproject.com/"
    },
    "C Programming": {
        "description": "C is a foundational programming language great for system-level development.",
        "next_courses_for_graph_display_only": ["Data Structures", "Operating Systems", "C++"],
        "url": "https://www.learn-c.org/"
    },
    "Node.js": {
        "description": "Node.js is a runtime environment to run JavaScript on the server side.",
        "next_courses_for_graph_display_only": ["Express.js", "MongoDB", "NestJS"],
        "url": "https://nodejs.dev/en/learn"
    },
    "Machine Learning": {
        "description": "Machine Learning is a branch of AI focused on building systems that learn from data.",
        "next_courses_for_graph_display_only": ["Deep Learning", "Natural Language Processing", "Computer Vision"],
        "url": "https://www.coursera.org/specializations/machine-learning-introduction"
    },
     "Ethical Hacking": {
        "description": "Ethical Hacking involves finding security vulnerabilities to help organizations improve their security posture.",
        "next_courses_for_graph_display_only": ["Penetration Testing", "Cybersecurity Analyst", "Digital Forensics"],
        "url": "https://www.eccouncil.org/programs/certified-ethical-hacker-ceh/"
    },
    "Networking": {
        "description": "Networking focuses on the design, implementation, and management of computer networks.",
        "next_courses_for_graph_display_only": ["CCNA", "Network Security", "Cloud Networking"],
        "url": "https://www.cisco.com/c/en/us/training-events/training-certifications/certifications/associate/ccna.html"
    }
}

YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "best.pt")
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

# SentenceTransformer model might not be needed if semantic similarity is not used
# try:
#     sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
#     logging.info("Successfully loaded SentenceTransformer model.")
# except Exception as e:
#     logging.error(f"Error loading SentenceTransformer model: {e}")

def clean_unicode(text):
    return text.encode("utf-8", "replace").decode("utf-8")

def infer_course_text_from_image_object(pil_image_obj):
    if not model:
        logging.error("YOLO model is not loaded. Cannot infer course text.")
        return None
    try:
        image_np = np.array(pil_image_obj)
        if image_np.ndim == 2: 
            image_np = cv2.cvtColor(image_np, cv2.COLOR_GRAY2RGB)
        elif image_np.shape[2] == 4: 
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

        logging.info("No specific course region found by YOLO, attempting OCR on the whole image as fallback.")
        full_image_text = pytesseract.image_to_string(pil_image_obj).strip()
        cleaned_full_text = clean_unicode(full_image_text)
        if cleaned_full_text:
            logging.info(f"Extracted text from full image (fallback): '{cleaned_full_text[:100]}...'")
            return cleaned_full_text
        logging.info("OCR on full image also yielded no text.")
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
            # Stricter conditions for UNVERIFIED to reduce noise
            if any(kw in line_text for kw in course_keywords) and \
               not all(word in course_keywords or word in stop_words or not word.isalnum() for word in line_text.split()) and \
               len(line_text.split()) >= 2 and len(line_text.split()) <= 7 and \
               any(word.lower() not in stop_words and len(word) > 2 for word in line_text.split()) and \
               line_text not in identified_courses: # Ensure it's not already added
                identified_courses.append(f"{line_text.title()} [UNVERIFIED]") # Mark as UNVERIFIED
                    
    return list(set(identified_courses))


def query_llm_for_detailed_suggestions(known_course_names_list):
    if not co:
        logging.warning("Cohere client not initialized. Skipping LLM suggestions.")
        return {"error": "Cohere LLM not available."}
    if not known_course_names_list:
        logging.warning("No known course names provided to LLM for suggestions.")
        return {"error": "No known course names provided for suggestions."}

    # Ensure UNVERIFIED tag is removed for the prompt
    prompt_course_list = [name.replace(" [UNVERIFIED]", "") for name in known_course_names_list]

    prompt = f"""
You are an expert curriculum advisor. You will be given a list of course names the user is considered to have knowledge in: {', '.join(prompt_course_list)}.

For EACH of these courses from the input list, you MUST provide the following structured information:
1.  "Identified Course: [The exact course name from the input list that this block refers to]"
2.  "AI Description: [Generate a concise 1-2 sentence description for this 'Identified Course'. If you cannot generate one, state 'No AI description available.']"
3.  "Suggested Next Courses:" (This line must be present)
    Then, for 2-3 relevant next courses that build upon the 'Identified Course', provide:
    - "Name: [Suggested Course 1 Name]" (on a new line)
    - "Description: [Brief 1-2 sentence description for Suggested Course 1]" (on a new line)
    - "URL: [A valid, direct link to take Suggested Course 1]" (on a new line)
    (Repeat the Name, Description, URL lines for each of the 2-3 suggestions for this 'Identified Course')

IMPORTANT FORMATTING RULES:
-   Separate each main "Identified Course" block (meaning the block starting with "Identified Course: ... AI Description: ... Suggested Next Courses: ...") with a line containing only "---".
-   If no relevant next courses can be suggested for a particular "Identified Course", then under "Suggested Next Courses:", you MUST write "No specific suggestions available for this course." on a new line and nothing else for that suggestion part.
-   Do NOT include any other preambles, summaries, or explanations outside of this structure for each identified course.
-   Ensure URLs are complete and valid (e.g., start with http:// or https://).

Example of a valid response for ONE identified course:
Identified Course: Python
AI Description: Python is a versatile, high-level programming language known for its readability and extensive libraries, widely used in web development, data science, and artificial intelligence.
Suggested Next Courses:
- Name: Advanced Python Programming
  Description: Delve deeper into Python with advanced topics like asynchronous programming, metaclasses, and performance optimization.
  URL: https://example.com/advanced-python
- Name: Machine Learning with Python
  Description: Learn the fundamentals of machine learning and apply them using Python libraries like scikit-learn and TensorFlow.
  URL: https://example.com/ml-python
---
(If there was another course in the input like 'JavaScript', its block would follow here)
"""
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.3)
        logging.info(f"Cohere LLM raw response for detailed suggestions: {response.text[:1000]}...")
        return {"text": response.text.strip()}
    except Exception as e:
        logging.error(f"Error querying Cohere LLM for detailed suggestions: {e}")
        return {"error": f"Error from LLM: {str(e)}"}

def parse_llm_detailed_suggestions_response(llm_response_text):
    parsed_results = []
    if not llm_response_text or \
       llm_response_text.strip().lower() == "cohere llm not available." or \
       llm_response_text.strip().lower().startswith("error from llm:") or \
       llm_response_text.strip().lower() == "no known course names provided for suggestions.":
        logging.warning(f"LLM response indicates no suggestions or an error: {llm_response_text}")
        return parsed_results

    # Normalize line endings and clean up potential markdown
    cleaned_response_text = llm_response_text.replace('\r\n', '\n')
    cleaned_response_text = re.sub(r"```(?:json|text)?\n?", "", cleaned_response_text)
    cleaned_response_text = re.sub(r"\n?```", "", cleaned_response_text)

    main_blocks = re.split(r'\n---\n', cleaned_response_text)
    logging.info(f"LLM Parser: Split into {len(main_blocks)} main identified course blocks.")

    for block_text in main_blocks:
        block_text = block_text.strip()
        if not block_text:
            continue

        identified_course_match = re.search(r"Identified Course:\s*(.*?)\n", block_text, re.IGNORECASE)
        ai_description_match = re.search(r"AI Description:\s*(.*?)\nSuggested Next Courses:", block_text, re.IGNORECASE | re.DOTALL)
        
        if not identified_course_match or not ai_description_match:
            logging.warning(f"LLM Parser: Could not find 'Identified Course' or 'AI Description' in block: '{block_text[:200]}...'")
            continue
            
        identified_course_name = identified_course_match.group(1).strip()
        ai_description = ai_description_match.group(1).strip()
        if ai_description.lower() == "no ai description available.":
            ai_description = None # Store as None if not available

        current_suggestions = []
        # Extract the text part for suggestions
        suggestions_text_match = re.search(r"Suggested Next Courses:\n(.*?)$", block_text, re.IGNORECASE | re.DOTALL)
        
        if suggestions_text_match:
            suggestions_blob = suggestions_text_match.group(1).strip()
            if suggestions_blob.lower() == "no specific suggestions available for this course.":
                logging.info(f"LLM Parser: No specific suggestions for '{identified_course_name}'.")
            else:
                # Split suggestions within the blob. Each suggestion starts with "- Name:"
                individual_suggestion_blocks = re.split(r'\n-\s*Name:', suggestions_blob)
                
                for i, sug_block_part in enumerate(individual_suggestion_blocks):
                    if i == 0 and sug_block_part.strip() == "": # First element might be empty if split begins with delimiter
                         if not suggestions_blob.strip().startswith("- Name:"): # Handle if the first suggestion doesn't have the leading '-'
                            sug_block_part = suggestions_blob 
                         else: 
                            continue
                    
                    # Re-add "- Name:" if it was removed by split, or handle case where it's the very first item
                    full_sug_block = sug_block_part if (i == 0 and not suggestions_blob.strip().startswith("- Name:")) else "- Name:" + sug_block_part
                    full_sug_block = full_sug_block.strip()

                    sug_name_match = re.search(r"-\s*Name:\s*(.*?)\n", full_sug_block, re.IGNORECASE)
                    sug_desc_match = re.search(r"Description:\s*(.*?)\n", full_sug_block, re.IGNORECASE | re.DOTALL)
                    sug_url_match = re.search(r"URL:\s*(https?://\S+)", full_sug_block, re.IGNORECASE)

                    if sug_name_match and sug_desc_match and sug_url_match:
                        current_suggestions.append({
                            "name": sug_name_match.group(1).strip(),
                            "description": sug_desc_match.group(1).strip(),
                            "url": sug_url_match.group(1).strip()
                        })
                    else:
                        logging.warning(f"LLM Parser: Could not parse full suggestion (name, desc, or URL missing) in block for '{identified_course_name}'. Suggestion block part: '{full_sug_block[:100]}...'")
        else:
            logging.warning(f"LLM Parser: 'Suggested Next Courses:' section not found or malformed for '{identified_course_name}'.")

        parsed_results.append({
            "identified_course_name": identified_course_name,
            "ai_description": ai_description,
            "llm_suggestions": current_suggestions
        })
        logging.info(f"LLM Parser: Parsed '{identified_course_name}', AI Desc: '{ai_description}', Suggestions: {len(current_suggestions)}")

    return parsed_results


def process_images_for_ocr(image_data_list):
    """
    Phase 1: Processes images to extract text using OCR and identifies failures.
    Returns a dictionary with 'successfully_extracted_courses' and 'failed_extraction_images'.
    """
    all_extracted_raw_texts = []
    processed_image_file_ids = [] # Tracks file IDs for which OCR was attempted
    failed_extraction_images = [] # Tracks images that failed any part of the loading/OCR

    for image_data in image_data_list:
        logging.info(f"--- OCR Phase: Processing image: {image_data['original_filename']} (Type: {image_data['content_type']}, ID: {image_data.get('file_id', 'N/A')}) ---")
        current_file_id = str(image_data.get('file_id', 'N/A'))
        original_filename_for_failure = image_data['original_filename']
        
        if current_file_id != 'N/A' and current_file_id not in processed_image_file_ids:
            processed_image_file_ids.append(current_file_id)

        pil_images_to_process = []
        conversion_or_load_failed = False
        failure_reason = "Unknown image processing error during OCR phase"

        try:
            if image_data['content_type'] == 'application/pdf':
                if not os.getenv("POPPLER_PATH") and not shutil.which("pdftoppm"):
                    failure_reason = "Poppler (PDF tool) not found. Cannot process PDF."
                    conversion_or_load_failed = True
                else:
                    pdf_pages = convert_from_bytes(image_data['bytes'], dpi=300, poppler_path=os.getenv("POPPLER_PATH"))
                    if not pdf_pages:
                        failure_reason = "PDF converted to zero images (possibly empty or corrupt)."
                        conversion_or_load_failed = True
                    else:
                        pil_images_to_process.extend(pdf_pages)
            elif image_data['content_type'].startswith('image/'):
                img_object = Image.open(io.BytesIO(image_data['bytes']))
                pil_images_to_process.append(img_object)
            else:
                failure_reason = f"Unsupported content type: {image_data['content_type']}"
                conversion_or_load_failed = True
        
        except UnidentifiedImageError:
            failure_reason = "Cannot identify image file. It might be corrupt or not a supported image format."
            conversion_or_load_failed = True
        except Exception as e: 
            failure_reason = f"Error during image conversion/loading: {str(e)}"
            if "poppler" in str(e).lower(): failure_reason = f"Poppler (PDF tool) error: {str(e)}"
            conversion_or_load_failed = True

        if conversion_or_load_failed:
            logging.error(f"{failure_reason} for file {original_filename_for_failure}.")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                failed_extraction_images.append({
                    "file_id": current_file_id, "original_filename": original_filename_for_failure, "reason": failure_reason
                })
            continue
        
        if not pil_images_to_process: # Should not happen if conversion_or_load_failed is false, but as a safeguard
            failure_reason = "No image content available after loading (e.g., empty PDF)."
            logging.warning(f"{failure_reason} for {original_filename_for_failure}.")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                 failed_extraction_images.append({
                    "file_id": current_file_id, "original_filename": original_filename_for_failure, "reason": failure_reason
                })
            continue

        current_file_texts_extracted = []
        ocr_had_some_text_for_this_file = False
        for i, pil_img in enumerate(pil_images_to_process):
            try: # Ensure image is in RGB
                if pil_img.mode == 'RGBA': pil_img = pil_img.convert('RGB')
                elif pil_img.mode == 'P': pil_img = pil_img.convert('RGB') 
                elif pil_img.mode == 'L': pil_img = pil_img.convert('RGB') 
            except Exception as img_convert_err:
                logging.warning(f"Could not convert image mode for page {i} of {original_filename_for_failure}: {img_convert_err}")
                continue 

            course_text = infer_course_text_from_image_object(pil_img)
            if course_text:
                current_file_texts_extracted.append(course_text)
                ocr_had_some_text_for_this_file = True
        
        if ocr_had_some_text_for_this_file:
            all_extracted_raw_texts.extend(current_file_texts_extracted)
        else: 
            failure_reason = "OCR could not extract any text from the image content."
            logging.warning(f"{failure_reason} for {original_filename_for_failure}")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                failed_extraction_images.append({
                    "file_id": current_file_id, "original_filename": original_filename_for_failure, "reason": failure_reason
                })

    processed_course_mentions = []
    for raw_text_blob in all_extracted_raw_texts:
        filtered = filter_and_verify_course_text(raw_text_blob)
        processed_course_mentions.extend(filtered)
    
    successfully_extracted_courses = sorted(list(set(processed_course_mentions)))
    logging.info(f"OCR Phase: Successfully extracted courses: {successfully_extracted_courses}")
    logging.info(f"OCR Phase: Failed extraction images: {len(failed_extraction_images)}")

    return {
        "successfully_extracted_courses": successfully_extracted_courses,
        "failed_extraction_images": failed_extraction_images,
        "processed_image_file_ids": list(set(processed_image_file_ids)) # Return IDs of all images attempted in this OCR run
    }


def generate_suggestions_from_known_courses(
    all_known_course_names,
    previous_user_data_list=None
):
    """
    Phase 2: Generates detailed suggestions based on a list of known course names.
    Uses caching and LLM calls.
    """
    user_processed_data_output = []
    llm_error_summary_for_output = None
    
    # Build cache from previous full run data
    cached_suggestions_map = {}
    if previous_user_data_list:
        for prev_item_block in previous_user_data_list: # This is now a list of blocks from user_course_processing_collection
            # Assuming prev_item_block has 'identified_course_name', 'ai_description', 'llm_suggestions'
            if "identified_course_name" in prev_item_block:
                 cached_suggestions_map[prev_item_block["identified_course_name"]] = {
                     "ai_description": prev_item_block.get("ai_description"),
                     "llm_suggestions": prev_item_block.get("llm_suggestions", [])
                 }
    logging.info(f"Suggestions Phase: Built cache map from previous data: {len(cached_suggestions_map)} entries.")

    courses_to_query_llm_for = []
    for course_name in all_known_course_names:
        if course_name in cached_suggestions_map:
            logging.info(f"Suggestions Phase: Cache hit for '{course_name}'. Using cached data.")
            user_processed_data_output.append({
                "identified_course_name": course_name,
                "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                "ai_description": cached_suggestions_map[course_name]["ai_description"],
                "llm_suggestions": cached_suggestions_map[course_name]["llm_suggestions"],
                "llm_error": None # From cache, so assume no new error
            })
        else:
            courses_to_query_llm_for.append(course_name)
    
    if courses_to_query_llm_for:
        logging.info(f"Suggestions Phase: Querying LLM for {len(courses_to_query_llm_for)} courses: {courses_to_query_llm_for}")
        llm_response_data = query_llm_for_detailed_suggestions(courses_to_query_llm_for)
        
        if "error" in llm_response_data:
            llm_error_summary_for_output = llm_response_data["error"]
            logging.error(f"Suggestions Phase: LLM query failed for batch: {llm_error_summary_for_output}")
            # Add error entry for all courses that were supposed to be queried
            for course_name in courses_to_query_llm_for:
                user_processed_data_output.append({
                    "identified_course_name": course_name,
                    "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                    "ai_description": None,
                    "llm_suggestions": [],
                    "llm_error": llm_error_summary_for_output
                })
        elif "text" in llm_response_data:
            parsed_llm_items = parse_llm_detailed_suggestions_response(llm_response_data["text"])
            if not parsed_llm_items and courses_to_query_llm_for: # LLM responded but parsing failed
                 llm_error_summary_for_output = "LLM response received but no valid items could be parsed. Check format. See server logs."
                 logging.warning(llm_error_summary_for_output)
            
            parsed_items_map = {item["identified_course_name"]: item for item in parsed_llm_items}

            for course_name in courses_to_query_llm_for:
                llm_item_for_course = parsed_items_map.get(course_name.replace(" [UNVERIFIED]", "")) # Match cleaned name
                
                if llm_item_for_course:
                    user_processed_data_output.append({
                        "identified_course_name": course_name, # Keep original name with [UNVERIFIED] if present
                        "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                        "ai_description": llm_item_for_course["ai_description"],
                        "llm_suggestions": llm_item_for_course["llm_suggestions"],
                        "llm_error": None
                    })
                else: # LLM was queried, but this specific course was not in its parsed response
                    error_msg_for_course = f"LLM was queried for '{course_name}', but no specific data was returned/parsed for it."
                    if llm_error_summary_for_output and "parsing failed" in llm_error_summary_for_output.lower():
                         error_msg_for_course = llm_error_summary_for_output # Use general parsing error
                    logging.warning(error_msg_for_course)
                    user_processed_data_output.append({
                        "identified_course_name": course_name,
                        "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                        "ai_description": None,
                        "llm_suggestions": [],
                        "llm_error": error_msg_for_course
                    })
        else: # Unexpected LLM response structure
            llm_error_summary_for_output = "Unexpected response structure from LLM."
            logging.error(f"Suggestions Phase: {llm_error_summary_for_output}")
            for course_name in courses_to_query_llm_for:
                 user_processed_data_output.append({
                    "identified_course_name": course_name,
                    "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                    "ai_description": None, "llm_suggestions": [], "llm_error": llm_error_summary_for_output
                })
    
    # Sort final output by identified_course_name for consistency
    user_processed_data_output.sort(key=lambda x: x.get("identified_course_name", "").lower())

    return {
        "user_processed_data": user_processed_data_output,
        "llm_error_summary": llm_error_summary_for_output # General error from the batch LLM call
    }


# Main orchestrator function
def extract_and_recommend_courses_from_image_data(
    image_data_list=None, 
    mode='ocr_only', # 'ocr_only' or 'suggestions_only'
    known_course_names=None, # Used in 'suggestions_only' mode
    previous_user_data_list=None, # Used for caching in 'suggestions_only' mode
    additional_manual_courses=None # General manual courses from textarea
):
    if mode == 'ocr_only':
        if not image_data_list:
            return {
                "successfully_extracted_courses": [], 
                "failed_extraction_images": [],
                "processed_image_file_ids": []
            }
        
        ocr_results = process_images_for_ocr(image_data_list)
        
        # Add general manual courses to the successfully_extracted_courses list for this phase
        # This is so frontend can see them immediately if it wants to
        current_successful_courses = ocr_results.get("successfully_extracted_courses", [])
        if additional_manual_courses:
            for manual_course in additional_manual_courses:
                clean_manual_course = manual_course.strip()
                if clean_manual_course and clean_manual_course not in current_successful_courses:
                    current_successful_courses.append(clean_manual_course)
            ocr_results["successfully_extracted_courses"] = sorted(list(set(current_successful_courses)))

        return ocr_results

    elif mode == 'suggestions_only':
        if not known_course_names and not additional_manual_courses:
            return {
                "user_processed_data": [], 
                "llm_error_summary": "No course names provided for suggestion generation."
            }
        
        # Consolidate known_course_names and additional_manual_courses
        final_known_names = list(set(known_course_names or []))
        if additional_manual_courses:
            for manual_course in additional_manual_courses:
                clean_manual_course = manual_course.strip()
                if clean_manual_course and clean_manual_course not in final_known_names:
                    final_known_names.append(clean_manual_course)
        final_known_names = sorted(list(set(final_known_names)))
        
        if not final_known_names: # If after consolidation, it's still empty
             return {
                "user_processed_data": [], 
                "llm_error_summary": "No course names available after consolidation for suggestion generation."
            }

        logging.info(f"Suggestions Phase: Generating suggestions for consolidated known courses: {final_known_names}")
        suggestion_results = generate_suggestions_from_known_courses(
            final_known_names,
            previous_user_data_list
        )
        # processed_image_file_ids are not directly relevant here as OCR was done in a previous step
        # The frontend holds the IDs from the ocr_only phase if it needs to display them.
        # However, for the final DB storage, we might want to associate all image IDs that contributed.
        # For now, this function focuses on suggestion generation.
        return suggestion_results

    else:
        logging.error(f"Invalid mode specified: {mode}")
        return {"error": f"Invalid processing mode: {mode}"}


# --- Main (for local testing) ---
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    test_image_folder = "test_images_for_failed_extraction" 
    if not os.path.exists(test_image_folder): os.makedirs(test_image_folder)
    
    blank_image_path = os.path.join(test_image_folder, "blank_image.png")
    # ... (rest of the local testing setup as before, but adapt to call new modes)

    # Test OCR Only Mode
    print("\n--- Testing OCR Only Mode ---")
    test_img_data = []
    if os.path.exists(blank_image_path):
        with open(blank_image_path, "rb") as f: img_bytes = f.read()
        test_img_data.append({
            "bytes": img_bytes, "original_filename": "blank_image.png", 
            "content_type": "image/png", "file_id": "blank_id_1"
        })
    # Add a dummy Python certificate image data for testing successful OCR
    # (Create a simple image with "Python Course" text for this to work)
    # python_img_path = os.path.join(test_image_folder, "python_cert.png") 
    # if os.path.exists(python_img_path):
    #    with open(python_img_path, "rb") as f: py_bytes = f.read()
    #    test_img_data.append({"bytes": py_bytes, "original_filename": "python_cert.png", "content_type": "image/png", "file_id": "python_id_1"})


    ocr_results = extract_and_recommend_courses_from_image_data(
        image_data_list=test_img_data,
        mode='ocr_only',
        additional_manual_courses=["Manual Test Course"]
    )
    print("OCR Results (Local Test):")
    print(json.dumps(ocr_results, indent=2))

    # Test Suggestions Only Mode (using results from OCR or mocked)
    print("\n--- Testing Suggestions Only Mode ---")
    known_courses_for_suggestions = ocr_results.get("successfully_extracted_courses", [])
    if not known_courses_for_suggestions: # Fallback if OCR yielded nothing
        known_courses_for_suggestions = ["Python", "Introduction to AI [UNVERIFIED]", "Manual Test Course"] 
    
    # Mock previous data for caching test
    mock_previous_run = [
        {
            "identified_course_name": "Python",
            "description_from_graph": "Python is versatile...",
            "ai_description": "AI desc for Python from cache.",
            "llm_suggestions": [{"name": "Cached Flask", "description": "Flask from cache.", "url": "http://cached.com/flask"}],
            "llm_error": None
        }
    ]

    suggestion_results = extract_and_recommend_courses_from_image_data(
        mode='suggestions_only',
        known_course_names=known_courses_for_suggestions,
        previous_user_data_list=mock_previous_run 
    )
    print("\nSuggestion Results (Local Test):")
    print(json.dumps(suggestion_results, indent=2))

    print("\n--- Testing LLM Detailed Suggestion Parsing ---")
    mock_llm_text = """
Identified Course: Python
AI Description: Python is a versatile, high-level programming language known for its readability and extensive libraries.
Suggested Next Courses:
- Name: Advanced Python
  Description: Explore advanced Python topics.
  URL: https://example.com/advpython
- Name: Data Science with Python
  Description: Learn data science using Python.
  URL: https://example.com/ds-python
---
Identified Course: JavaScript
AI Description: JavaScript is essential for web development.
Suggested Next Courses:
- Name: React Framework
  Description: Build UIs with React.
  URL: https://reactjs.org
- Name: Node.js Backend
  Description: Server-side JavaScript with Node.js.
  URL: https://nodejs.org
---
Identified Course: Obscure Topic [UNVERIFIED]
AI Description: No AI description available.
Suggested Next Courses:
No specific suggestions available for this course.
"""
    parsed_data = parse_llm_detailed_suggestions_response(mock_llm_text)
    print("Parsed LLM Detailed Suggestions:")
    print(json.dumps(parsed_data, indent=2))

    if not COHERE_API_KEY:
        print("\nNOTE: Cohere API key not set. LLM calls were skipped in tests.")
</content>
  </change>
  <change>
    <file>/app.py</file>
    <content><![CDATA[
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
user_course_processing_collection = None 

try:
    if MONGODB_URI:
        app.logger.info(f"Attempting to connect to MongoDB with URI (first part): {MONGODB_URI.split('@')[0] if '@' in MONGODB_URI else 'URI_FORMAT_UNEXPECTED'}")
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) 
        mongo_client.admin.command('ismaster') 
        db = mongo_client[DB_NAME]
        fs_images = GridFS(db, collection="images") 
        user_course_processing_collection = db["user_course_processing_results"]
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
if POPPLER_PATH: app_logger.info(f"Flask app.py: POPPLER_PATH found: {POPPLER_PATH}")
else: app_logger.info("Flask app.py: POPPLER_PATH not set.")


@app.route('/', methods=['GET'])
def health_check():
    app_logger.info("Flask /: Health check endpoint hit.")
    return jsonify({"status": "Flask server is running", "message": "Welcome to ImageVerse Flask API!"}), 200


@app.route('/api/process-certificates', methods=['POST'])
def process_certificates_from_db():
    req_id_cert = datetime.now().strftime('%Y%m%d%H%M%S%f')
    app_logger.info(f"Flask /api/process-certificates (Req ID: {req_id_cert}): Received request.")
    
    if mongo_client is None or db is None or fs_images is None or user_course_processing_collection is None:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): MongoDB connection or required collection not available.")
        return jsonify({"error": "Database connection or required collection is not available."}), 503

    data = request.get_json()
    user_id = data.get("userId")
    processing_mode = data.get("mode", "ocr_only") # 'ocr_only' or 'suggestions_only'
    
    # For 'ocr_only' mode
    additional_manual_courses_general = data.get("additionalManualCourses", []) # General manual courses from textarea

    # For 'suggestions_only' mode
    known_course_names_from_frontend = data.get("knownCourseNames", []) # All resolved names for suggestion phase
                                                                       # This list already includes OCR'd, manually named for failures, and general manual.

    if not user_id:
        app_logger.warning(f"Flask (Req ID: {req_id_cert}): User ID not provided.")
        return jsonify({"error": "User ID (userId) not provided"}), 400

    app_logger.info(f"Flask (Req ID: {req_id_cert}): Processing for userId: {user_id}, Mode: {processing_mode}.")
    app_logger.info(f"Flask (Req ID: {req_id_cert}): General Manual Courses: {additional_manual_courses_general}")
    app_logger.info(f"Flask (Req ID: {req_id_cert}): Known Course Names for Suggestions: {known_course_names_from_frontend}")


    try:
        image_data_for_processing = []
        if processing_mode == 'ocr_only': # Fetch images only if we need to OCR them
            user_image_files_cursor = db.images.files.find({"metadata.userId": user_id})
            for file_doc in user_image_files_cursor:
                file_id = file_doc["_id"]
                original_filename = file_doc.get("metadata", {}).get("originalName", file_doc["filename"])
                content_type = file_doc.get("contentType", "application/octet-stream") 
                
                app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Fetching file: ID={file_id}, Name={original_filename}")
                grid_out = fs_images.get(file_id)
                image_bytes = grid_out.read()
                grid_out.close()
                
                effective_content_type = file_doc.get("metadata", {}).get("sourceContentType", content_type)
                if file_doc.get("metadata", {}).get("convertedTo"): 
                     effective_content_type = file_doc.get("metadata", {}).get("convertedTo")

                image_data_for_processing.append({
                    "bytes": image_bytes, "original_filename": original_filename, 
                    "content_type": effective_content_type, "file_id": str(file_id) 
                })
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): Found {len(image_data_for_processing)} images for OCR.")

        # --- Call the main processing function based on mode ---
        processing_result_dict = {}
        latest_previous_user_data_list = [] # For caching in suggestions_only mode

        if processing_mode == 'ocr_only':
            if not image_data_for_processing and not additional_manual_courses_general:
                 app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): No images and no general manual courses. Returning empty handed.")
                 return jsonify({
                    "successfully_extracted_courses": [],
                    "failed_extraction_images": [],
                    "processed_image_file_ids": [],
                    "message": "No certificate images found in DB and no manual courses provided for OCR."
                 }), 200
            
            processing_result_dict = extract_and_recommend_courses_from_image_data(
                image_data_list=image_data_for_processing,
                mode='ocr_only',
                additional_manual_courses=additional_manual_courses_general
            )
            app_logger.info(f"Flask (Req ID: {req_id_cert}, OCR_MODE): OCR processing complete.")
            # No DB storage in this phase

        elif processing_mode == 'suggestions_only':
            if not known_course_names_from_frontend: # This list should already include general manual courses
                return jsonify({"user_processed_data": [], "llm_error_summary": "No course names provided for suggestion generation."}), 200

            # Fetch latest *structured* processing result for this user to use as cache
            try:
                latest_doc = user_course_processing_collection.find_one(
                    {"userId": user_id},
                    sort=[("processedAt", DESCENDING)],
                    projection={"user_processed_data": 1, "processed_image_file_ids": 1} 
                )
                if latest_doc and "user_processed_data" in latest_doc:
                    latest_previous_user_data_list = latest_doc["user_processed_data"]
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Fetched 'user_processed_data' from latest record for cache.")
                else:
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): No previous processed data found for cache.")
            except Exception as e:
                app_logger.error(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Error fetching latest processed data: {e}")

            processing_result_dict = extract_and_recommend_courses_from_image_data(
                mode='suggestions_only',
                known_course_names=known_course_names_from_frontend,
                previous_user_data_list=latest_previous_user_data_list
            )
            app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Suggestion processing complete.")

            # --- Store results in MongoDB for 'suggestions_only' mode ---
            current_processed_data_for_db = processing_result_dict.get("user_processed_data", [])
            should_store_new_result = True # Default to store

            if latest_previous_user_data_list: # Compare if previous data exists
                # Simplified comparison: if the set of identified course names is the same,
                # and the number of suggestions per course is roughly similar, consider it "same enough" to skip storage.
                # This avoids overly complex deep dict comparison for now.
                prev_course_names = set(item['identified_course_name'] for item in latest_previous_user_data_list)
                curr_course_names = set(item['identified_course_name'] for item in current_processed_data_for_db)
                
                if prev_course_names == curr_course_names:
                    # Basic check on suggestion counts if names match
                    # This is a heuristic, can be made more robust
                    prev_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in latest_previous_user_data_list)
                    curr_sug_counts = sum(len(item.get('llm_suggestions', [])) for item in current_processed_data_for_db)
                    if abs(prev_sug_counts - curr_sug_counts) <= len(curr_course_names): # Allow some minor diff
                        should_store_new_result = False
                        app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): New processing result seems similar to latest. Skipping storage.")
            
            if should_store_new_result and current_processed_data_for_db:
                try:
                    # Get all image file IDs associated with this user, to log them with the processed result
                    # This makes the stored record self-contained regarding which images were involved overall.
                    user_all_image_ids = [str(doc["_id"]) for doc in db.images.files.find({"metadata.userId": user_id}, projection={"_id": 1})]

                    data_to_store_in_db = {
                        "userId": user_id,
                        "processedAt": datetime.utcnow(),
                        "user_processed_data": current_processed_data_for_db,
                        "associated_image_file_ids": user_all_image_ids, # All user images at time of this processing
                        "llm_error_summary_at_processing": processing_result_dict.get("llm_error_summary")
                    }
                    insert_result = user_course_processing_collection.insert_one(data_to_store_in_db)
                    app_logger.info(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Stored new structured processing result. Inserted ID: {insert_result.inserted_id}")
                except Exception as e:
                    app_logger.error(f"Flask (Req ID: {req_id_cert}, SUGGEST_MODE): Error storing new structured result: {e}")
        else:
            app_logger.error(f"Flask (Req ID: {req_id_cert}): Invalid processing_mode '{processing_mode}'.")
            return jsonify({"error": f"Invalid processing mode: {processing_mode}"}), 400
        
        return jsonify(processing_result_dict)

    except Exception as e:
        app_logger.error(f"Flask (Req ID: {req_id_cert}): Error during certificate processing for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


if __name__ == '__main__':
    app.logger.info("Flask application starting with __name__ == '__main__'")
    app_logger.info(f"Effective MONGODB_URI configured: {'Yes' if MONGODB_URI else 'No'}")
    app_logger.info(f"Effective MONGODB_DB_NAME: {DB_NAME}")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)
</content>
  </change>
  <change>
    <file>/src/app/ai-feature/page.tsx</file>
    <content><![CDATA[
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Sparkles, ExternalLink, AlertTriangle, Info, CheckCircle, ListChecks, Wand2 } from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// --- TypeScript Interfaces ---
interface LLMSuggestion {
  name: string;
  description: string;
  url: string;
}

interface UserProcessedCourseData {
  identified_course_name: string;
  description_from_graph?: string | null;
  ai_description?: string | null; // New field for AI generated description of the identified course
  llm_suggestions: LLMSuggestion[];
  llm_error?: string | null;
}

interface FailedExtractionImage {
  file_id: string;
  original_filename: string;
  reason?: string;
}

// For Phase 1 (OCR only) response
interface OcrPhaseResult {
  successfully_extracted_courses?: string[];
  failed_extraction_images?: FailedExtractionImage[];
  processed_image_file_ids?: string[]; // IDs of all images attempted in OCR phase
  error?: string;
  message?: string;
}

// For Phase 2 (Suggestions) response - this is also the final structure
interface SuggestionsPhaseResult {
  user_processed_data?: UserProcessedCourseData[];
  llm_error_summary?: string | null;
  error?: string;
  message?: string; // General messages from backend
}

type ProcessingPhase = 'initial' | 'manualNaming' | 'processingSuggestions' | 'results';


function AiFeaturePageContent() {
  const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL || 'http://localhost:5000';
  const { toast } = useToast();
  const { userId, user } = useAuth();

  // State Management
  const [phase, setPhase] = useState<ProcessingPhase>('initial');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [generalManualCoursesInput, setGeneralManualCoursesInput] = useState<string>('');
  
  // Data from OCR phase (Phase 1)
  const [ocrSuccessfullyExtracted, setOcrSuccessfullyExtracted] = useState<string[]>([]);
  const [ocrFailedImages, setOcrFailedImages] = useState<FailedExtractionImage[]>([]);
  const [ocrProcessedImageFileIds, setOcrProcessedImageFileIds] = useState<string[]>([]);

  // User input for failed images during 'manualNaming' phase
  const [manualNamesForFailedImages, setManualNamesForFailedImages] = useState<{ [key: string]: string }>({});
  
  // Final result from suggestions phase (Phase 2)
  const [finalResult, setFinalResult] = useState<SuggestionsPhaseResult | null>(null);


  const handleManualNameChange = (fileId: string, name: string) => {
    setManualNamesForFailedImages(prev => ({ ...prev, [fileId]: name }));
  };

  const resetToInitialState = () => {
    setPhase('initial');
    setIsLoading(false);
    setError(null);
    // setGeneralManualCoursesInput(''); // Optionally keep this
    setOcrSuccessfullyExtracted([]);
    setOcrFailedImages([]);
    setOcrProcessedImageFileIds([]);
    setManualNamesForFailedImages({});
    setFinalResult(null);
  };

  const handlePrimaryButtonClick = useCallback(async () => {
    if (!userId) {
      toast({ title: 'Authentication Required', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setError(null);
    const endpoint = `${flaskServerBaseUrl}/api/process-certificates`;

    if (phase === 'initial' || phase === 'results') { // Start or restart OCR phase
      resetToInitialState(); // Clear everything for a fresh start or restart
      setPhase('initial'); // Explicitly set to initial if restarting from results
      
      const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            mode: 'ocr_only',
            additionalManualCourses: generalManualCourses 
          }),
        });
        const data: OcrPhaseResult = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        setOcrSuccessfullyExtracted(data.successfully_extracted_courses || []);
        setOcrFailedImages(data.failed_extraction_images || []);
        setOcrProcessedImageFileIds(data.processed_image_file_ids || []);

        if (data.failed_extraction_images && data.failed_extraction_images.length > 0) {
          setPhase('manualNaming');
          toast({
            title: 'Action Required',
            description: `${data.failed_extraction_images.length} certificate(s) need manual naming. Please review below.`,
            duration: 7000
          });
        } else if ((data.successfully_extracted_courses && data.successfully_extracted_courses.length > 0) || generalManualCourses.length > 0) {
          // No OCR failures, but there are courses to process for suggestions
          // Automatically trigger the suggestions phase
          setPhase('processingSuggestions'); // Intermediate state before calling suggestions
          // Use a brief timeout to allow state update before calling the next phase function
          setTimeout(() => handlePrimaryButtonClick(), 0); 
        } else {
          toast({ title: 'Nothing to Process', description: data.message || 'No courses extracted and no manual courses provided.' });
          setPhase('initial'); // Stay initial or go to a specific "empty" state
        }

      } catch (err: any) {
        setError(err.message || 'Failed OCR phase.');
        toast({ title: 'OCR Phase Failed', description: err.message, variant: 'destructive' });
        setPhase('initial');
      } finally {
        setIsLoading(false); // Loading for OCR phase ends here
      }

    } else if (phase === 'manualNaming' || phase === 'processingSuggestions') { // Trigger suggestions phase
      setPhase('processingSuggestions'); // Ensure phase is set
      const userProvidedNamesForFailures = Object.values(manualNamesForFailedImages).map(name => name.trim()).filter(name => name.length > 0);
      const generalManualCourses = generalManualCoursesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
      
      const allKnownCourses = [
        ...new Set([
          ...ocrSuccessfullyExtracted, 
          ...userProvidedNamesForFailures,
          ...generalManualCourses
        ])
      ].filter(name => name.length > 0);

      if (allKnownCourses.length === 0) {
        toast({ title: 'No Courses', description: 'No courses available to get suggestions for.', variant: 'destructive' });
        setIsLoading(false);
        setPhase('initial'); // Or back to 'manualNaming' if ocrFailedImages still exist
        return;
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            mode: 'suggestions_only',
            knownCourseNames: allKnownCourses
            // additionalManualCourses is implicitly included in knownCourseNames by frontend logic
          }),
        });
        const data: SuggestionsPhaseResult = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || `Server error: ${response.status}`);
        }

        setFinalResult(data);
        setPhase('results');
        if (data.user_processed_data && data.user_processed_data.length > 0) {
          toast({ title: 'Suggestions Generated', description: `AI suggestions and descriptions generated for ${data.user_processed_data.length} course(s).` });
        } else if (data.message) {
           toast({ title: 'Processing Info', description: data.message });
        }
        if (data.llm_error_summary) {
          toast({ title: "LLM Warning", description: data.llm_error_summary, variant: "destructive", duration: 7000 });
        }

      } catch (err: any) {
        setError(err.message || 'Failed suggestions phase.');
        toast({ title: 'Suggestions Phase Failed', description: err.message, variant: 'destructive' });
        setPhase('initial'); // Or a more specific error state
      } finally {
        setIsLoading(false); // Loading for suggestions phase ends here
      }
    }
  }, [userId, flaskServerBaseUrl, phase, generalManualCoursesInput, ocrSuccessfullyExtracted, manualNamesForFailedImages, toast]);

  // Determine button text and icon
  let buttonText = "Process Certificates for OCR";
  let ButtonIcon = ListChecks;
  if (phase === 'manualNaming') {
    buttonText = "Proceed with AI Suggestions";
    ButtonIcon = Wand2;
  } else if (phase === 'processingSuggestions') {
    buttonText = "Generating Suggestions...";
    ButtonIcon = Loader2; // Will be animated by className
  } else if (phase === 'results') {
    buttonText = "Start New Processing";
    ButtonIcon = ListChecks;
  }


  return (
    <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8 flex flex-col h-[calc(100vh-var(--header-height,4rem)-1px)]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" aria-label="Go back to Home">
            <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-3xl font-bold font-headline">Certificate Insights & Recommendations</h1>
        </div>
      </div>
      
      <p className="mb-4 text-muted-foreground">
        Process uploaded certificates. Phase 1: OCR. Phase 2: Manual naming for OCR failures (if any). Phase 3: AI Suggestions.
        Server: <code className="font-code">{flaskServerBaseUrl}</code>.
      </p>

      {/* --- General Manual Courses Input - Always Visible (or conditionally based on phase) --- */}
      { (phase === 'initial' || phase === 'manualNaming') && (
        <div className="space-y-2 mb-6">
          <Label htmlFor="generalManualCourses">Manually Add Courses (comma-separated, processed with others)</Label>
          <Textarea
            id="generalManualCourses"
            placeholder="e.g., Advanced Python, Introduction to Docker"
            value={generalManualCoursesInput}
            onChange={(e) => setGeneralManualCoursesInput(e.target.value)}
            className="min-h-[80px]"
            disabled={isLoading || phase === 'processingSuggestions' || phase === 'results'}
          />
        </div>
      )}

      <Button onClick={handlePrimaryButtonClick} disabled={isLoading || !user || phase === 'processingSuggestions'} className="w-full sm:w-auto mb-6">
        <ButtonIcon className={`mr-2 h-4 w-4 ${isLoading || phase === 'processingSuggestions' ? 'animate-spin' : ''}`} />
        {buttonText}
      </Button>
      {!user && <p className="text-sm text-destructive mb-6">Please log in to process certificates.</p>}
      {error && (
        <Card className="mb-6 border-destructive bg-destructive/10">
          <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2"/>Error</CardTitle></CardHeader>
          <CardContent><p>{error}</p></CardContent>
        </Card>
      )}

      {/* --- Phase: Manual Naming for OCR Failures --- */}
      {phase === 'manualNaming' && ocrFailedImages.length > 0 && (
        <Card className="my-6 border-amber-500 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-xl font-headline text-amber-700 flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5" /> Name Unidentified Certificates
            </CardTitle>
            <CardDescription>
              OCR failed for {ocrFailedImages.length} image(s). Please provide the course name for each.
              These names will be used to get AI suggestions in the next step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {ocrFailedImages.map(img => (
              <div key={img.file_id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 border rounded-md bg-background/50 shadow-sm">
                <div className="relative w-full sm:w-24 h-32 sm:h-24 rounded-md overflow-hidden shrink-0 border">
                   {img.file_id !== 'N/A' ? (
                     <NextImage 
                      src={`/api/images/${img.file_id}`} 
                      alt={`Certificate: ${img.original_filename}`}
                      fill sizes="(max-width: 640px) 100vw, 96px" className="object-contain" data-ai-hint="certificate needs naming"
                     />
                   ) : (
                     <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">No Preview (ID missing)</div>
                   )}
                </div>
                <div className="flex-grow space-y-1 w-full sm:w-auto">
                  <p className="text-xs font-semibold text-muted-foreground truncate" title={img.original_filename}>{img.original_filename}</p>
                  {img.reason && <p className="text-xs text-amber-600 italic">Reason: {img.reason}</p>}
                  <Input
                    type="text"
                    placeholder="Enter course name for this image"
                    value={manualNamesForFailedImages[img.file_id] || ''}
                    onChange={(e) => handleManualNameChange(img.file_id, e.target.value)}
                    className="w-full mt-1"
                    aria-label={`Manual course name for ${img.original_filename}`}
                    disabled={isLoading}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* --- Displaying Successfully OCR'd courses during manualNaming phase for context --- */}
      {phase === 'manualNaming' && ocrSuccessfullyExtracted.length > 0 && (
        <Card className="mb-6 border-green-500 bg-green-500/10">
            <CardHeader>
                <CardTitle className="text-lg font-headline text-green-700 flex items-center">
                    <CheckCircle className="mr-2 h-5 w-5" /> Successfully OCR'd Courses
                </CardTitle>
                <CardDescription>
                    These courses were identified by OCR and will be included when you proceed to get AI suggestions.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="list-disc pl-5 text-sm text-green-700">
                    {ocrSuccessfullyExtracted.map(course => <li key={course}>{course}</li>)}
                </ul>
            </CardContent>
        </Card>
      )}


      {/* --- Phase: Results Display Area --- */}
      {phase === 'results' && finalResult && (
        <div className="flex-grow border border-border rounded-lg shadow-md overflow-y-auto p-4 bg-card space-y-6">
          <h2 className="text-2xl font-headline mb-4 border-b pb-2">Processed Result & AI Suggestions:</h2>
          
          {ocrProcessedImageFileIds.length > 0 && ( // Show images processed in OCR phase
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 font-headline">Certificate Images Considered in this Run:</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {ocrProcessedImageFileIds.map(fileId => (
                  <div key={`processed-${fileId}`} className="aspect-[4/3] relative rounded-md overflow-hidden border shadow-sm">
                    <NextImage 
                      src={`/api/images/${fileId}`} alt={`Processed certificate image ${fileId}`}
                      fill sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="object-contain" data-ai-hint="certificate image"
                    />
                     <a href={`/api/images/${fileId}`} target="_blank" rel="noopener noreferrer" className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors" title="Open image in new tab">
                       <ExternalLink className="w-3 h-3"/>
                     </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {finalResult.message && !finalResult.user_processed_data?.length && (
            <Card className="bg-blue-500/10 border-blue-500">
              <CardHeader className="flex-row items-center gap-2"><Info className="w-5 h-5 text-blue-700" /><CardTitle className="text-blue-700 text-lg">Information</CardTitle></CardHeader>
              <CardContent><p className="text-blue-700">{finalResult.message}</p></CardContent>
            </Card>
          )}
          
          {finalResult.llm_error_summary && (
             <Card className="border-amber-500 bg-amber-500/10">
              <CardHeader className="flex-row items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-700" /><CardTitle className="text-amber-700 text-lg">LLM Warning</CardTitle></CardHeader>
              <CardContent><p className="text-amber-700">{finalResult.llm_error_summary}</p></CardContent>
            </Card>
          )}

          {finalResult.user_processed_data && finalResult.user_processed_data.length > 0 ? (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold font-headline">Identified Courses & AI Suggestions:</h3>
              {finalResult.user_processed_data.map((identifiedCourseData, index) => (
                <Card key={`identified-${index}`} className="bg-background/50 shadow-inner">
                  <CardHeader>
                    <CardTitle className="text-xl font-headline text-primary">
                      {identifiedCourseData.identified_course_name}
                    </CardTitle>
                    {identifiedCourseData.description_from_graph && (
                      <CardDescription className="pt-1 text-sm italic">Graph Description: {identifiedCourseData.description_from_graph}</CardDescription>
                    )}
                    {identifiedCourseData.ai_description && (
                      <CardDescription className="pt-1 text-sm">AI Description: {identifiedCourseData.ai_description}</CardDescription>
                    )}
                     {!identifiedCourseData.description_from_graph && !identifiedCourseData.ai_description && (
                        <CardDescription className="pt-1 text-sm italic">No description available for this course.</CardDescription>
                     )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <h4 className="font-semibold text-md">AI Suggested Next Steps:</h4>
                    {identifiedCourseData.llm_suggestions && identifiedCourseData.llm_suggestions.length > 0 ? (
                      <ul className="space-y-3 list-none pl-0">
                        {identifiedCourseData.llm_suggestions.map((suggestion, sugIndex) => (
                          <li key={`sug-${index}-${sugIndex}`} className="border p-3 rounded-md bg-card shadow-sm">
                            <p className="font-medium text-base">{suggestion.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{suggestion.description}</p>
                            {suggestion.url && (
                              <Button variant="link" size="sm" asChild className="px-0 h-auto text-primary hover:text-primary/80">
                                <a href={suggestion.url} target="_blank" rel="noopener noreferrer">
                                  Learn more <ExternalLink className="ml-1 h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : identifiedCourseData.llm_error ? (
                       <p className="text-sm text-amber-700 italic">Note: {identifiedCourseData.llm_error}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No specific AI suggestions available for this item.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            phase === 'results' && <p className="text-muted-foreground italic">No comprehensive suggestions were generated in this run.</p>
          )}
          <div className="mt-6 pt-4 border-t">
            <Label htmlFor="rawJsonOutput" className="text-xs text-muted-foreground">Raw JSON Output (for debugging):</Label>
            <Textarea id="rawJsonOutput" readOnly value={JSON.stringify(finalResult, null, 2)}
              className="w-full h-auto min-h-[150px] text-xs font-code bg-muted/30 resize-none mt-1"
              aria-label="Raw processing result JSON"
            />
          </div>
        </div>
      )}
       <p className="mt-4 text-xs text-muted-foreground">
        Note: Ensure Flask server URL is correct and backend services (DB, AI) are operational.
      </p>
    </div>
  );
}

export default function AiFeaturePage() {
  return (
    <ProtectedPage>
      <AiFeaturePageContent />
    </ProtectedPage>
  );
}
