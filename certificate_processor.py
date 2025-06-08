
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

# Check for Tesseract installation
TESSERACT_PATH = shutil.which("tesseract")
if not TESSERACT_PATH:
    logging.critical(
        "Tesseract OCR executable not found in PATH. "
        "Pytesseract will fail. Please install Tesseract OCR and ensure it's added to your system's PATH. "
        "On Debian/Ubuntu: sudo apt-get install tesseract-ocr. On macOS: brew install tesseract. "
        "For Windows, download installer from UB Mannheim Tesseract page."
    )
else:
    logging.info(f"Tesseract OCR executable found at: {TESSERACT_PATH}")


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
        return None, "YOLO model not loaded"
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
                    try:
                        text = pytesseract.image_to_string(cropped_pil_image).strip()
                        cleaned_text = clean_unicode(text)
                        if cleaned_text:
                            logging.info(f"Extracted text from detected region ('{label}'): '{cleaned_text}'")
                            return cleaned_text, None
                    except pytesseract.TesseractError as tess_err:
                        logging.error(f"PytesseractError during OCR on cropped region ('{label}'): {tess_err}")
                        return None, f"Tesseract OCR error on cropped region: {str(tess_err).splitlines()[0] if str(tess_err) else 'Details in logs.'}"
                    except Exception as ocr_crop_err:
                        logging.error(f"Non-Tesseract error during OCR on cropped region ('{label}'): {ocr_crop_err}")
                        return None, f"OCR error on cropped region: {str(ocr_crop_err)}"


        logging.info("No specific course region found by YOLO, attempting OCR on the whole image as fallback.")
        try:
            full_image_text = pytesseract.image_to_string(pil_image_obj).strip()
            cleaned_full_text = clean_unicode(full_image_text)
            if cleaned_full_text:
                logging.info(f"Extracted text from full image (fallback): '{cleaned_full_text[:100]}...'")
                return cleaned_full_text, None
            logging.info("OCR on full image also yielded no text.")
            return None, "OCR on full image yielded no text after YOLO fallback."
        except pytesseract.TesseractError as tess_err_full:
            logging.error(f"PytesseractError during OCR on full image (fallback): {tess_err_full}")
            return None, f"Tesseract OCR error on full image: {str(tess_err_full).splitlines()[0] if str(tess_err_full) else 'Details in logs.'}"
        except Exception as ocr_full_err:
            logging.error(f"Non-Tesseract error during OCR on full image (fallback): {ocr_full_err}")
            return None, f"OCR error on full image: {str(ocr_full_err)}"

    except Exception as e:
        logging.error(f"Error during YOLO inference or general image processing: {e}", exc_info=True)
        return None, f"YOLO/Image processing error: {str(e)}"

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
                # Split suggestions within the blob. Each suggestion starts with "- Name:" or "Name:"
                # Allow for optional leading hyphen and space
                individual_suggestion_blocks = re.split(r'\n(?:-\s*)?Name:', suggestions_blob)
                
                for i, sug_block_part in enumerate(individual_suggestion_blocks):
                    sug_block_part_cleaned = sug_block_part.strip()
                    if i == 0 and not sug_block_part_cleaned : # First element might be empty if split begins with delimiter
                         if not suggestions_blob.strip().lower().startswith("name:"): # Handle if the first suggestion doesn't have the leading '-'
                            # This means the first part is the actual first suggestion block
                            pass
                         else: 
                            continue # Skip empty first element
                    
                    # Re-add "Name:" if it was removed by split, or handle case where it's the very first item
                    # and the blob itself didn't start with "Name:" (e.g., just the name directly)
                    full_sug_block = sug_block_part_cleaned
                    if not sug_block_part_cleaned.lower().startswith("name:"):
                        full_sug_block = "Name: " + sug_block_part_cleaned


                    sug_name_match = re.search(r"Name:\s*(.*?)\n", full_sug_block, re.IGNORECASE)
                    sug_desc_match = re.search(r"Description:\s*(.*?)\n", full_sug_block, re.IGNORECASE | re.DOTALL)
                    sug_url_match = re.search(r"URL:\s*(https?://\S+)", full_sug_block, re.IGNORECASE)

                    if sug_name_match and sug_desc_match and sug_url_match:
                        current_suggestions.append({
                            "name": sug_name_match.group(1).strip(),
                            "description": sug_desc_match.group(1).strip(),
                            "url": sug_url_match.group(1).strip()
                        })
                    else:
                        logging.warning(f"LLM Parser: Could not parse full suggestion (name, desc, or URL missing) in block for '{identified_course_name}'. Suggestion block part: '{full_sug_block[:100]}...' Name_match: {bool(sug_name_match)}, Desc_match: {bool(sug_desc_match)}, URL_match: {bool(sug_url_match)}")
        else:
            logging.warning(f"LLM Parser: 'Suggested Next Courses:' section not found or malformed for '{identified_course_name}'.")

        parsed_results.append({
            "identified_course_name": identified_course_name,
            "ai_description": ai_description,
            "llm_suggestions": current_suggestions
        })
        logging.info(f"LLM Parser: Parsed '{identified_course_name}', AI Desc: {'Present' if ai_description else 'None'}, Suggestions: {len(current_suggestions)}")

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
                    logging.error(failure_reason + f" for file {original_filename_for_failure}. Check POPPLER_PATH or if pdftoppm is in PATH.")
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
        
        if not pil_images_to_process: 
            failure_reason = "No image content available after loading (e.g., empty PDF or unreadable image)."
            logging.warning(f"{failure_reason} for {original_filename_for_failure}.")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                 failed_extraction_images.append({
                    "file_id": current_file_id, "original_filename": original_filename_for_failure, "reason": failure_reason
                })
            continue

        current_file_texts_extracted = []
        ocr_had_some_text_for_this_file = False
        ocr_failure_reason_for_this_file = None

        for i, pil_img in enumerate(pil_images_to_process):
            page_identifier = f"page {i+1} of " if len(pil_images_to_process) > 1 else ""
            try: 
                if pil_img.mode not in ['RGB', 'L']: # Convert if not RGB or Grayscale
                    pil_img = pil_img.convert('RGB')
            except Exception as img_convert_err:
                logging.warning(f"Could not convert image mode for {page_identifier}{original_filename_for_failure}: {img_convert_err}")
                # Store a reason, but try to continue if there are other pages.
                # If this is the only "image" (e.g. single page PDF, or single image file), this reason will be used.
                ocr_failure_reason_for_this_file = f"Image mode conversion failed: {img_convert_err}"
                continue 

            course_text, text_extract_reason = infer_course_text_from_image_object(pil_img)
            if course_text:
                current_file_texts_extracted.append(course_text)
                ocr_had_some_text_for_this_file = True
                ocr_failure_reason_for_this_file = None # Clear any previous page error if one page succeeds
                break # If text found on one page, assume that's good enough for this file
            elif text_extract_reason and not ocr_failure_reason_for_this_file:
                 # If no text extracted, store the first significant reason encountered for this file
                 ocr_failure_reason_for_this_file = text_extract_reason
        
        if ocr_had_some_text_for_this_file:
            all_extracted_raw_texts.extend(current_file_texts_extracted)
        else: 
            final_reason = ocr_failure_reason_for_this_file or "OCR could not extract any usable text from the image content."
            logging.warning(f"{final_reason} for {original_filename_for_failure}")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                failed_extraction_images.append({
                    "file_id": current_file_id, "original_filename": original_filename_for_failure, "reason": final_reason
                })

    processed_course_mentions = []
    for raw_text_blob in all_extracted_raw_texts:
        filtered = filter_and_verify_course_text(raw_text_blob)
        processed_course_mentions.extend(filtered)
    
    successfully_extracted_courses = sorted(list(set(processed_course_mentions)))
    logging.info(f"OCR Phase: Successfully extracted courses: {successfully_extracted_courses}")
    logging.info(f"OCR Phase: Failed extraction images count: {len(failed_extraction_images)}")
    if failed_extraction_images: logging.debug(f"OCR Phase: Failed extraction image details: {failed_extraction_images}")


    return {
        "successfully_extracted_courses": successfully_extracted_courses,
        "failed_extraction_images": failed_extraction_images,
        "processed_image_file_ids": list(set(processed_image_file_ids)) 
    }


def generate_suggestions_from_known_courses(
    all_known_course_names,
    previous_user_data_list=None # This is a list of user_processed_data items
):
    """
    Phase 2: Generates detailed suggestions based on a list of known course names.
    Uses caching and LLM calls. Returns a structure for each known course.
    """
    user_processed_data_output = [] # This will be a list of dicts, one for each course in all_known_course_names
    llm_error_summary_for_output = None # General error if LLM call fails for the batch
    
    cached_data_map = {}
    if previous_user_data_list:
        for prev_item in previous_user_data_list: # Each item is a full block for an identified course
            if "identified_course_name" in prev_item:
                 cached_data_map[prev_item["identified_course_name"]] = prev_item # Cache the whole block
    logging.info(f"Suggestions Phase: Built cache map from previous data with {len(cached_data_map)} entries.")

    courses_to_query_llm_for = []
    # First, process courses that might be in cache
    for course_name in all_known_course_names:
        # Check cache using the exact course_name (which might include [UNVERIFIED])
        if course_name in cached_data_map:
            logging.info(f"Suggestions Phase: Cache hit for '{course_name}'. Using cached data.")
            # Add the entire cached block for this course
            user_processed_data_output.append(cached_data_map[course_name])
        else:
            courses_to_query_llm_for.append(course_name)
    
    if courses_to_query_llm_for:
        logging.info(f"Suggestions Phase: Querying LLM for {len(courses_to_query_llm_for)} courses: {courses_to_query_llm_for}")
        llm_response_data = query_llm_for_detailed_suggestions(courses_to_query_llm_for)
        
        if "error" in llm_response_data:
            llm_error_summary_for_output = llm_response_data["error"]
            logging.error(f"Suggestions Phase: LLM query failed for batch: {llm_error_summary_for_output}")
            # For courses that were supposed to be queried but LLM failed, create error entries
            for course_name in courses_to_query_llm_for:
                user_processed_data_output.append({
                    "identified_course_name": course_name,
                    "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                    "ai_description": None,
                    "llm_suggestions": [],
                    "llm_error": llm_error_summary_for_output # Assign batch error to each
                })
        elif "text" in llm_response_data:
            parsed_llm_items = parse_llm_detailed_suggestions_response(llm_response_data["text"])
            
            # Map parsed LLM items by their identified_course_name for easy lookup
            parsed_items_map = {item["identified_course_name"]: item for item in parsed_llm_items}

            if not parsed_llm_items and courses_to_query_llm_for:
                 llm_error_summary_for_output = "LLM response received but no valid items could be parsed. Check LLM output format and server logs."
                 logging.warning(f"Suggestions Phase: {llm_error_summary_for_output}")


            for course_name in courses_to_query_llm_for:
                # Try to match with the name LLM would have used (without [UNVERIFIED])
                llm_item_for_course = parsed_items_map.get(course_name.replace(" [UNVERIFIED]", ""))
                
                if llm_item_for_course:
                    user_processed_data_output.append({
                        "identified_course_name": course_name, # Use original name (with [UNVERIFIED] if present)
                        "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                        "ai_description": llm_item_for_course["ai_description"],
                        "llm_suggestions": llm_item_for_course["llm_suggestions"],
                        "llm_error": None # Successfully processed by LLM
                    })
                else: 
                    # LLM was queried, but this specific course was not in its parsed response
                    # Or parsing failed to produce any items
                    error_msg_for_this_course = f"LLM was queried, but no specific data was returned or parsed for '{course_name}'."
                    if llm_error_summary_for_output and "parsed" in llm_error_summary_for_output: # If general parsing error, use that
                        error_msg_for_this_course = llm_error_summary_for_output
                    
                    logging.warning(error_msg_for_this_course)
                    user_processed_data_output.append({
                        "identified_course_name": course_name,
                        "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                        "ai_description": None,
                        "llm_suggestions": [],
                        "llm_error": error_msg_for_this_course
                    })
        else: # Unexpected LLM response structure (neither "text" nor "error")
            llm_error_summary_for_output = "Unexpected response structure from LLM query function."
            logging.error(f"Suggestions Phase: {llm_error_summary_for_output}")
            for course_name in courses_to_query_llm_for:
                 user_processed_data_output.append({
                    "identified_course_name": course_name,
                    "description_from_graph": course_graph.get(course_name.replace(" [UNVERIFIED]", ""), {}).get("description"),
                    "ai_description": None, "llm_suggestions": [], "llm_error": llm_error_summary_for_output
                })
    
    # Sort final output by identified_course_name for consistency, if needed by frontend
    user_processed_data_output.sort(key=lambda x: x.get("identified_course_name", "").lower())

    return {
        "user_processed_data": user_processed_data_output,
        "llm_error_summary": llm_error_summary_for_output # This is the general error from the batch LLM call if any
    }


# Main orchestrator function
def extract_and_recommend_courses_from_image_data(
    image_data_list=None, 
    mode='ocr_only', # 'ocr_only' or 'suggestions_only'
    known_course_names=None, # Used in 'suggestions_only' mode
    previous_user_data_list=None, # Used for caching in 'suggestions_only' mode (list of user_processed_data items)
    additional_manual_courses=None # General manual courses from textarea
):
    if mode == 'ocr_only':
        # Ensure additional_manual_courses is a list
        current_additional_manual_courses = additional_manual_courses if isinstance(additional_manual_courses, list) else []

        if not image_data_list and not current_additional_manual_courses: # If no images and no general manual courses
            logging.info("OCR Phase: No images and no general manual courses provided. Returning empty handed.")
            return {
                "successfully_extracted_courses": [], 
                "failed_extraction_images": [],
                "processed_image_file_ids": [] 
                # "message": "No certificate images found in DB and no manual courses provided for OCR." # Optional: add message
            }
        
        # Ensure image_data_list is a list, even if empty, for process_images_for_ocr
        current_image_data_list = image_data_list if isinstance(image_data_list, list) else []
        ocr_results = process_images_for_ocr(current_image_data_list)
        
        # Add general manual courses to the successfully_extracted_courses list for this phase
        # This is so frontend can see them immediately if it wants to (e.g. for consolidating for phase 2)
        current_successful_courses = ocr_results.get("successfully_extracted_courses", [])
        if current_additional_manual_courses:
            for manual_course in current_additional_manual_courses:
                clean_manual_course = manual_course.strip()
                if clean_manual_course and clean_manual_course not in current_successful_courses:
                    current_successful_courses.append(clean_manual_course)
            ocr_results["successfully_extracted_courses"] = sorted(list(set(current_successful_courses)))

        logging.info(f"OCR Phase complete. Successfully extracted: {len(ocr_results.get('successfully_extracted_courses',[]))}, Failed images: {len(ocr_results.get('failed_extraction_images',[]))}")
        return ocr_results

    elif mode == 'suggestions_only':
        final_known_names_for_suggestions = known_course_names if isinstance(known_course_names, list) else []
        
        # Note: additional_manual_courses should have been consolidated into known_course_names by frontend before calling this mode.
        # If not, you might want to add them here too like in 'ocr_only' mode, but typically frontend handles the consolidated list for phase 2.
        # For safety, let's ensure it's robust:
        current_additional_manual_courses = additional_manual_courses if isinstance(additional_manual_courses, list) else []
        if current_additional_manual_courses:
            for manual_course in current_additional_manual_courses:
                clean_manual_course = manual_course.strip()
                if clean_manual_course and clean_manual_course not in final_known_names_for_suggestions:
                    final_known_names_for_suggestions.append(clean_manual_course)
        
        final_known_names_for_suggestions = sorted(list(set(filter(None, final_known_names_for_suggestions))))


        if not final_known_names_for_suggestions:
            logging.warning("Suggestions Phase: No course names provided for suggestion generation.")
            return {
                "user_processed_data": [], 
                "llm_error_summary": "No course names provided for suggestion generation."
            }
        
        logging.info(f"Suggestions Phase: Generating suggestions for {len(final_known_names_for_suggestions)} consolidated known courses: {final_known_names_for_suggestions}")
        
        current_previous_user_data_list = previous_user_data_list if isinstance(previous_user_data_list, list) else None
        suggestion_results = generate_suggestions_from_known_courses(
            final_known_names_for_suggestions,
            current_previous_user_data_list
        )
        logging.info(f"Suggestions Phase complete. Processed data items: {len(suggestion_results.get('user_processed_data',[]))}, LLM summary: {suggestion_results.get('llm_error_summary')}")
        return suggestion_results

    else:
        logging.error(f"Invalid mode specified: {mode}")
        return {"error": f"Invalid processing mode: {mode}"}


# --- Main (for local testing) ---
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    test_image_folder = "test_images_for_failed_extraction" 
    if not os.path.exists(test_image_folder): os.makedirs(test_image_folder)
    
    # Create a dummy blank image for testing failed OCR
    try:
        blank_image_path = os.path.join(test_image_folder, "blank_image.png")
        if not os.path.exists(blank_image_path):
            img = Image.new('RGB', (60, 30), color = 'white')
            img.save(blank_image_path)
    except Exception as e:
        logging.error(f"Could not create blank test image: {e}")


    print("\n--- Testing OCR Only Mode ---")
    test_img_data = []
    if os.path.exists(blank_image_path):
        with open(blank_image_path, "rb") as f: img_bytes = f.read()
        test_img_data.append({
            "bytes": img_bytes, "original_filename": "blank_image.png", 
            "content_type": "image/png", "file_id": "blank_id_1"
        })
    
    # Add a dummy Python certificate image data for testing successful OCR
    # You would need to create a simple image with "Python Course" text named "python_cert.png" in the test_image_folder
    python_img_path = os.path.join(test_image_folder, "python_cert.png") 
    if os.path.exists(python_img_path):
       with open(python_img_path, "rb") as f: py_bytes = f.read()
       test_img_data.append({"bytes": py_bytes, "original_filename": "python_cert.png", "content_type": "image/png", "file_id": "python_id_1"})
    else:
        logging.warning(f"Test image 'python_cert.png' not found in '{test_image_folder}'. OCR success test for it will be skipped.")


    ocr_results = extract_and_recommend_courses_from_image_data(
        image_data_list=test_img_data,
        mode='ocr_only',
        additional_manual_courses=["Manual Test Course 1"]
    )
    print("OCR Results (Local Test):")
    print(json.dumps(ocr_results, indent=2))

    print("\n--- Testing Suggestions Only Mode (using results from OCR or mocked) ---")
    known_courses_for_suggestions = ocr_results.get("successfully_extracted_courses", [])
    # Ensure there's something to test suggestions with
    if not any("Python" in s for s in known_courses_for_suggestions): # If python_cert.png didn't exist/work
        known_courses_for_suggestions.append("Python")
    if not any("AI Intro" in s for s in known_courses_for_suggestions):
         known_courses_for_suggestions.append("Introduction to AI [UNVERIFIED]")


    # Mock previous data for caching test
    mock_previous_run_data = [
        {
            "identified_course_name": "Python", # Exact match to one of the known courses
            "description_from_graph": course_graph.get("Python",{}).get("description"),
            "ai_description": "This is a cached AI description for Python.",
            "llm_suggestions": [
                {"name": "Cached Advanced Python", "description": "Deep dive into Python from cache.", "url": "http://example.com/cached-adv-python"},
                {"name": "Cached Web Dev with Python", "description": "Web dev using Python from cache.", "url": "http://example.com/cached-web-python"}
            ],
            "llm_error": None
        }
    ]

    suggestion_results = extract_and_recommend_courses_from_image_data(
        mode='suggestions_only',
        known_course_names=known_courses_for_suggestions, # This list comes from OCR + manual naming of failures + general manual
        previous_user_data_list=mock_previous_run_data, # This is the `user_processed_data` part of a previous run
        additional_manual_courses=["Manual Test Course 2"] # Test consolidation in suggestions_only mode too
    )
    print("\nSuggestion Results (Local Test):")
    print(json.dumps(suggestion_results, indent=2))


    print("\n--- Testing LLM Detailed Suggestion Parsing (already in file) ---")
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
Identified Course: Obscure Topic
AI Description: No AI description available.
Suggested Next Courses:
No specific suggestions available for this course.
"""
    parsed_data = parse_llm_detailed_suggestions_response(mock_llm_text)
    print("Parsed LLM Detailed Suggestions:")
    print(json.dumps(parsed_data, indent=2))

    if not COHERE_API_KEY:
        print("\nNOTE: Cohere API key not set. LLM calls were skipped in relevant tests.")
        print("To fully test, set COHERE_API_KEY in your .env file.")

    # Test Poppler check (optional, shows log if not found)
    if not os.getenv("POPPLER_PATH") and not shutil.which("pdftoppm"):
        logging.warning("Local test: Poppler (pdftoppm) not found in POPPLER_PATH env var or system PATH. PDF processing in tests might be skipped or log errors.")
    else:
        logging.info("Local test: Poppler (pdftoppm) seems to be available.")

    # Test YOLO model loading message (already happens at start)
    if not model:
        logging.warning("Local test: YOLO model ('best.pt') could not be loaded. OCR functionality will be limited to full image OCR without region detection.")

    if not TESSERACT_PATH:
         logging.warning("Local test: Tesseract executable not found. OCR will fail.")


