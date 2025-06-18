
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
from typing import List, Optional, Tuple, Dict, Union
from datetime import datetime, timezone # Added for timezone-aware datetimes

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
COHERE_API_KEY = "jrAUYREK77bel5TGil5uyrzogksRcSxP78v97egn"

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


possible_courses = ["HTML", "CSS", "JavaScript", "React", "Astro.js", "Python", "Flask", "C Programming", "Kotlin", "Ethical Hacking", "Networking", "Node.js", "Machine Learning", "Data Structures", "Operating Systems", "Next.js", "Remix", "Express.js", "MongoDB", "Docker", "Kubernetes", "Tailwind CSS", "Django", "Typescript"]

course_graph = {
    "HTML": {
        "description": "HTML (HyperText Markup Language) is the standard language for creating webpages.",
        "suggested_next_courses": [
            {
                "name": "Responsive Web Design Certification by freeCodeCamp",
                "description": "Covers the basics of HTML and CSS with hands-on projects to build responsive websites.",
                "search_query": "responsive web design freecodecamp",
                "url": "https://www.freecodecamp.org/learn/responsive-web-design/"
            },
            {
                "name": "HTML5 and CSS3 Fundamentals by edX",
                "description": "Learn how to build modern web pages using HTML5 and CSS3.",
                "search_query": "HTML5 CSS3 fundamentals edX",
                "url": "https://www.edx.org/learn/html5"
            }
        ]
    },
    "CSS": {
        "description": "CSS (Cascading Style Sheets) is used to style and layout web pages.",
        "suggested_next_courses": [
            {
                "name": "Advanced CSS and Sass by Udemy",
                "description": "Master advanced CSS animations, layouts, and Sass preprocessing.",
                "search_query": "advanced css sass udemy",
                "url": "https://www.udemy.com/course/advanced-css-and-sass/"
            },
            {
                "name": "Tailwind CSS From Scratch by Udemy",
                "description": "Learn how to use Tailwind CSS to create modern UIs efficiently.",
                "search_query": "tailwind css udemy",
                "url": "https://www.udemy.com/course/tailwind-from-scratch/"
            }
        ]
    },
    "JavaScript": {
        "description": "JavaScript adds interactivity to websites and is essential for frontend development.",
        "suggested_next_courses": [
            {
                "name": "JavaScript: Understanding the Weird Parts by Udemy",
                "description": "Dive deep into JavaScript's core mechanics like closures, prototypal inheritance, and more.",
                "search_query": "javascript understanding weird parts",
                "url": "https://www.udemy.com/course/understand-javascript/"
            },
            {
                "name": "Modern JavaScript from The Beginning by Udemy",
                "description": "Learn JavaScript with projects covering DOM manipulation, ES6+, and asynchronous programming.",
                "search_query": "modern javascript from the beginning",
                "url": "https://www.udemy.com/course/modern-javascript-from-the-beginning/"
            }
        ]
    },
    "Python": {
        "description": "Python is a versatile programming language used in web, AI, and automation.",
        "suggested_next_courses": [
            {
                "name": "Python for Everybody by University of Michigan (Coursera)",
                "description": "An introduction to Python with focus on data handling, APIs, and databases.",
                "search_query": "python for everybody coursera",
                "url": "https://www.coursera.org/specializations/python"
            },
            {
                "name": "Automate the Boring Stuff with Python",
                "description": "Practical course on using Python to automate everyday tasks like file manipulation and web scraping.",
                "search_query": "automate the boring stuff python",
                "url": "https://automatetheboringstuff.com/"
            }
        ]
    }
}

YOLO_MODEL_PATH = "D:/CertIntel/certificate.v1i.yolov8(1)/runs/detect/exp/weights/best.pt"
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
            logging.error(f"YOLO model not found at path: {YOLO_MODEL_PATH} or in script directory (if default path was 'best.pt'). Please check the path or set YOLO_MODEL_PATH.")
except Exception as e:
    logging.error(f"Error loading YOLO model: {e}")


def clean_unicode(text):
    return text.encode("utf-8", "replace").decode("utf-8")

def query_llm_for_course_from_text(text_content: str) -> Optional[str]:
    if not co:
        logging.warning("Cohere client not initialized. Skipping LLM course extraction from text.")
        return None
    if not text_content or not text_content.strip():
        logging.info("No text content provided to LLM for course extraction.")
        return None

    prompt = f"""You are an expert at identifying course titles from text. 
From the following text, extract ONLY the most prominent course name or title. 
Ensure the output is concise and contains just the course name. 
If no clear course name is present, respond with the exact string '[[NONE]]'.

Text:
---
{text_content[:3000]} 
---
Extracted Course Name:"""
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.1)
        extracted_course_name = response.text.strip()
        logging.info(f"LLM course extraction raw response: '{extracted_course_name}'")
        if extracted_course_name.upper() == "[[NONE]]" or not extracted_course_name:
            logging.info("LLM indicated no course name found in the text.")
            return None
        extracted_course_name = re.sub(r"^(course name:)\s*", "", extracted_course_name, flags=re.IGNORECASE)
        return extracted_course_name
    except Exception as e:
        logging.error(f"Error querying Cohere LLM for course extraction: {e}")
        return None

def infer_course_text_from_image_object(pil_image_obj: Image.Image) -> Tuple[List[str], str]:
    extracted_courses: List[str] = []
    status_message: str = "FAILURE_NO_COURSE_IDENTIFIED"

    if not model:
        logging.error("YOLO model is not loaded. Cannot perform regional inference.")
    elif TESSERACT_PATH:
        try:
            image_np = np.array(pil_image_obj)
            if image_np.ndim == 2: image_np = cv2.cvtColor(image_np, cv2.COLOR_GRAY2RGB)
            elif image_np.shape[2] == 4: image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)

            results = model(image_np)
            names = results[0].names
            boxes = results[0].boxes

            if boxes is not None and len(boxes) > 0:
                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    label = names[cls_id]
                    if label.lower() in ["certificatecourse", "course", "title"]:
                        left, top, right, bottom = map(int, box.xyxy[0].cpu().numpy())
                        cropped_pil_image = pil_image_obj.crop((left, top, right, bottom))
                        try:
                            regional_text = pytesseract.image_to_string(cropped_pil_image).strip()
                            regional_text_cleaned = clean_unicode(regional_text)
                            if regional_text_cleaned:
                                logging.info(f"Extracted text from YOLO region ('{label}'): '{regional_text_cleaned}'")
                                courses_from_region = filter_and_verify_course_text(regional_text_cleaned)
                                if courses_from_region:
                                    extracted_courses.extend(courses_from_region)
                                    status_message = "SUCCESS_YOLO_OCR"
                                    return list(set(extracted_courses)), status_message 
                        except pytesseract.TesseractError as tess_err:
                            logging.warning(f"PytesseractError on YOLO region ('{label}'): {tess_err}")
                        except Exception as ocr_crop_err:
                            logging.warning(f"Error OCRing YOLO region ('{label}'): {ocr_crop_err}")
        except Exception as yolo_err:
            logging.error(f"Error during YOLO inference: {yolo_err}", exc_info=True)
            status_message = "FAILURE_YOLO_ERROR"

    if not extracted_courses and TESSERACT_PATH:
        logging.info("No courses from YOLO or YOLO skipped. Attempting full image OCR + LLM.")
        try:
            full_image_text = pytesseract.image_to_string(pil_image_obj).strip()
            full_image_text_cleaned = clean_unicode(full_image_text)

            if not full_image_text_cleaned or len(full_image_text_cleaned) < 5:
                logging.info("Full image OCR yielded no significant text.")
                status_message = "FAILURE_FULL_IMAGE_OCR_NO_TEXT"
            else: 
                logging.info(f"Full image OCR text (first 200 chars): '{full_image_text_cleaned[:200]}...'")
                
                llm_extracted_course_name = query_llm_for_course_from_text(full_image_text_cleaned)
                if llm_extracted_course_name:
                    logging.info(f"LLM extracted course name: '{llm_extracted_course_name}'")
                    courses_from_llm = filter_and_verify_course_text(llm_extracted_course_name)
                    if courses_from_llm:
                        extracted_courses.extend(courses_from_llm)
                        status_message = "SUCCESS_LLM_EXTRACTION_FROM_FULL_OCR"
                        return list(set(extracted_courses)), status_message
                    else:
                        logging.info("LLM output filtered to no valid courses.")
                        status_message = "FAILURE_LLM_OUTPUT_FILTERED_EMPTY"
                else:
                    logging.info("LLM did not extract a course name from full image text.")
                    status_message = "FAILURE_LLM_NO_COURSE_IN_TEXT"
        
        except pytesseract.TesseractError as tess_err_full:
            logging.error(f"PytesseractError during OCR on full image (fallback): {tess_err_full}")
            status_message = f"FAILURE_FULL_IMAGE_TESSERACT_ERROR: {str(tess_err_full).splitlines()[0]}"
        except Exception as ocr_full_err:
            logging.error(f"Non-Tesseract error during OCR on full image (fallback): {ocr_full_err}")
            status_message = f"FAILURE_FULL_IMAGE_OCR_UNKNOWN_ERROR: {str(ocr_full_err)}"
    
    elif not TESSERACT_PATH:
        status_message = "FAILURE_TESSERACT_NOT_FOUND"
        logging.error("Tesseract not found, cannot perform any OCR steps.")

    return list(set(extracted_courses)), status_message


def extract_course_names_from_text(text):
    if not text: return []
    found_courses = []
    text_lower = text.lower()
    for course in possible_courses:
        if re.search(r'\b' + re.escape(course.lower()) + r'\b', text_lower):
            found_courses.append(course)
    return list(set(found_courses))

def filter_and_verify_course_text(text_input: Optional[str]) -> List[str]:
    if not text_input or len(text_input.strip()) < 3:
        return []
    
    text = re.sub(r'\s*¢\s*', '', text_input.strip()).strip()
    if not text: 
        return []

    phrases_to_remove = ["certificate of completion", "certificate of achievement", "is awarded to", "has successfully completed"]
    temp_text = text.lower()
    for phrase in phrases_to_remove:
        temp_text = temp_text.replace(phrase, "")
    
    potential_course_lines = [line.strip() for line in temp_text.split('\n') if len(line.strip()) > 4]
    if len(text.split()) <= 7 and '\n' not in text: 
        potential_course_lines.append(text.lower()) 

    identified_courses = []
    direct_matches_from_list = extract_course_names_from_text(text)
    for dm in direct_matches_from_list:
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
            words_in_line = line_text.split()
            is_plausible_new_course = (
                any(kw in line_text for kw in course_keywords) and 
                not all(word in course_keywords or word in stop_words or not word.isalnum() for word in words_in_line) and 
                len(words_in_line) >= 2 and len(words_in_line) <= 7 and 
                any(word.lower() not in stop_words and len(word) > 2 for word in words_in_line) 
            )
            is_short_llm_like_input = len(text.split()) <= 7 and '\n' not in text

            if is_plausible_new_course or (is_short_llm_like_input and line_text == text.lower()):
                title_cased_line = line_text.title()
                if title_cased_line not in identified_courses: 
                    cleaned_title_cased_line = title_cased_line 
                    if cleaned_title_cased_line: 
                         identified_courses.append(f"{cleaned_title_cased_line} [UNVERIFIED]") 
                    
    return list(set(identified_courses))


def query_llm_for_detailed_suggestions(known_course_names_list_cleaned: List[str]):
    if not co:
        logging.warning("Cohere client not initialized. Skipping LLM suggestions.")
        return {"error": "Cohere LLM not available."}
    if not known_course_names_list_cleaned:
        logging.warning("No known course names provided to Cohere LLM for suggestions.")
        return {"error": "No known course names provided for Cohere suggestions."}

    prompt_course_list_str = ', '.join(f"'{c}'" for c in known_course_names_list_cleaned)

    prompt = f"""
You are an expert curriculum advisor. You will be given a list of course names the user is considered to have knowledge in: {prompt_course_list_str}.

For EACH of these courses from the input list, you MUST provide the following structured information. Treat each item from the input list as a single, distinct course, even if it contains multiple terms or slashes.
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
        logging.info(f"Cohere LLM raw response for detailed suggestions (courses: {prompt_course_list_str}) (first 500 chars): {response.text[:500]}...")
        return {"text": response.text.strip()}
    except Exception as e:
        logging.error(f"Error querying Cohere LLM for detailed suggestions (courses: {prompt_course_list_str}): {e}")
        return {"error": f"Error from LLM: {str(e)}"}

def parse_llm_detailed_suggestions_response(llm_response_text: str) -> List[Dict[str, Union[str, None, List[Dict[str, str]]]]]:
    parsed_results = []
    if not llm_response_text or \
       llm_response_text.strip().lower() == "cohere llm not available." or \
       llm_response_text.strip().lower().startswith("error from llm:") or \
       llm_response_text.strip().lower() == "no known course names provided for suggestions.":
        logging.warning(f"LLM response indicates no suggestions or an error: {llm_response_text}")
        return parsed_results

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
        ai_description_match = re.search(r"AI Description:\s*(.*?)(?:\nSuggested Next Courses:|\Z)", block_text, re.IGNORECASE | re.DOTALL)
        
        if not identified_course_match:
            logging.warning(f"LLM Parser: Could not find 'Identified Course' in block. Full block text (first 300 chars): '{block_text[:300]}...'")
            continue
            
        identified_course_name_from_llm = identified_course_match.group(1).strip()
        
        ai_description = None
        if ai_description_match:
            desc_text = ai_description_match.group(1).strip()
            if desc_text.lower() != "no ai description available.":
                ai_description = desc_text
        else: # AI Description might not be followed by Suggested Next Courses if it's the last thing.
            ai_description_standalone_match = re.search(r"AI Description:\s*(.*?)$", block_text, re.IGNORECASE | re.DOTALL)
            if ai_description_standalone_match:
                desc_text = ai_description_standalone_match.group(1).strip()
                if desc_text.lower() != "no ai description available.":
                    ai_description = desc_text
            else:
                 logging.warning(f"LLM Parser: Could not find 'AI Description' for '{identified_course_name_from_llm}'. Block (first 300): '{block_text[:300]}...'")


        current_suggestions = []
        suggestions_text_match = re.search(r"Suggested Next Courses:\n(.*?)$", block_text, re.IGNORECASE | re.DOTALL)
        
        if suggestions_text_match:
            suggestions_blob = suggestions_text_match.group(1).strip()
            if suggestions_blob.lower() == "no specific suggestions available for this course.":
                logging.info(f"LLM Parser: No specific suggestions for '{identified_course_name_from_llm}'.")
            else:
                individual_suggestion_blocks = re.split(r'\n(?:-\s*)?Name:', suggestions_blob)
                
                for i, sug_block_part in enumerate(individual_suggestion_blocks):
                    sug_block_part_cleaned = sug_block_part.strip()
                    if i == 0 and not sug_block_part_cleaned : 
                         if not suggestions_blob.strip().lower().startswith("name:"): 
                            pass 
                         else: 
                            continue 
                    
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
                        logging.warning(f"LLM Parser: Could not parse full suggestion (name, desc, or URL missing) in block for '{identified_course_name_from_llm}'. Suggestion block part (first 150 chars): '{full_sug_block[:150]}...'. Name_match: {bool(sug_name_match)}, Desc_match: {bool(sug_desc_match)}, URL_match: {bool(sug_url_match)}")
        else:
            logging.warning(f"LLM Parser: 'Suggested Next Courses:' section not found or malformed for '{identified_course_name_from_llm}'. Block text (first 300 chars): '{block_text[:300]}...'")

        parsed_results.append({
            "identified_course_name_from_llm": identified_course_name_from_llm,
            "ai_description": ai_description,
            "llm_suggestions": current_suggestions
        })
        logging.info(f"LLM Parser: Parsed '{identified_course_name_from_llm}', AI Desc: {'Present' if ai_description else 'None'}, Suggestions: {len(current_suggestions)}")

    return parsed_results


def process_images_for_ocr(image_data_list):
    accumulated_successful_courses = []
    processed_image_file_ids = []
    failed_extraction_images = [] 

    for image_data_item in image_data_list:
        logging.info(f"--- OCR Phase: Processing image: {image_data_item['original_filename']} (Type: {image_data_item['content_type']}, ID: {image_data_item.get('file_id', 'N/A')}) ---")
        current_file_id = str(image_data_item.get('file_id', 'N/A'))
        original_filename_for_failure = image_data_item['original_filename']

        if current_file_id != 'N/A' and current_file_id not in processed_image_file_ids:
            processed_image_file_ids.append(current_file_id)

        pil_images_to_process_for_file_id = []
        conversion_or_load_error_for_file_id = False
        load_conversion_reason = "Unknown image loading/conversion error."

        try:
            if image_data_item['content_type'] == 'application/pdf':
                if not os.getenv("POPPLER_PATH") and not shutil.which("pdftoppm"):
                    load_conversion_reason = "Poppler (PDF tool) not found. Cannot process PDF."
                    conversion_or_load_error_for_file_id = True
                else:
                    pdf_pages = convert_from_bytes(image_data_item['bytes'], dpi=300, poppler_path=os.getenv("POPPLER_PATH"))
                    if not pdf_pages:
                        load_conversion_reason = "PDF converted to zero images (possibly empty or corrupt)."
                        conversion_or_load_error_for_file_id = True
                    else:
                        pil_images_to_process_for_file_id.extend(pdf_pages)
            elif image_data_item['content_type'].startswith('image/'):
                img_object = Image.open(io.BytesIO(image_data_item['bytes']))
                pil_images_to_process_for_file_id.append(img_object)
            else:
                load_conversion_reason = f"Unsupported content type: {image_data_item['content_type']}"
                conversion_or_load_error_for_file_id = True
        except UnidentifiedImageError:
            load_conversion_reason = "Cannot identify image file. It might be corrupt or not a supported image format."
            conversion_or_load_error_for_file_id = True
        except Exception as e:
            load_conversion_reason = f"Error during image conversion/loading: {str(e)}"
            if "poppler" in str(e).lower(): load_conversion_reason = f"Poppler (PDF tool) error: {str(e)}"
            conversion_or_load_error_for_file_id = True

        if conversion_or_load_error_for_file_id:
            logging.error(f"{load_conversion_reason} for file {original_filename_for_failure}.")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                failed_extraction_images.append({
                    "file_id": current_file_id, "original_filename": original_filename_for_failure, "reason": load_conversion_reason
                })
            continue 

        if not pil_images_to_process_for_file_id:
            no_content_reason = "No image content available after loading (e.g., empty PDF or unreadable image)."
            logging.warning(f"{no_content_reason} for {original_filename_for_failure}.")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                failed_extraction_images.append({
                    "file_id": current_file_id, "original_filename": original_filename_for_failure, "reason": no_content_reason
                })
            continue 

        any_course_extracted_this_file_id = False
        best_failure_reason_for_file_id = "FAILURE_NO_COURSE_IDENTIFIED" 

        for i, pil_img in enumerate(pil_images_to_process_for_file_id):
            page_identifier = f"page {i+1} of " if len(pil_images_to_process_for_file_id) > 1 else ""
            try:
                if pil_img.mode not in ['RGB', 'L']: pil_img = pil_img.convert('RGB')
            except Exception as img_convert_err:
                logging.warning(f"Could not convert image mode for {page_identifier}{original_filename_for_failure}: {img_convert_err}")
                page_specific_reason = f"Image mode conversion failed for page {i+1}: {img_convert_err}"
                best_failure_reason_for_file_id = page_specific_reason
                continue 

            courses_from_page, page_status_msg = infer_course_text_from_image_object(pil_img)
            best_failure_reason_for_file_id = page_status_msg 

            if courses_from_page:
                accumulated_successful_courses.extend(courses_from_page)
                any_course_extracted_this_file_id = True
                logging.info(f"Successfully extracted courses from {page_identifier}{original_filename_for_failure} (Status: {page_status_msg}): {courses_from_page}")
                break 
            else:
                logging.info(f"No courses extracted from {page_identifier}{original_filename_for_failure}. Status: {page_status_msg}")
        
        if not any_course_extracted_this_file_id:
            logging.warning(f"Final failure reason for {original_filename_for_failure} (ID: {current_file_id}): {best_failure_reason_for_file_id}")
            if current_file_id != 'N/A' and not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                failed_extraction_images.append({
                    "file_id": current_file_id,
                    "original_filename": original_filename_for_failure,
                    "reason": best_failure_reason_for_file_id 
                })

    final_successful_courses = sorted(list(set(accumulated_successful_courses)))
    logging.info(f"OCR Phase: Final successfully extracted courses: {final_successful_courses}")
    logging.info(f"OCR Phase: Failed extraction images count (need manual input): {len(failed_extraction_images)}")
    if failed_extraction_images: logging.debug(f"OCR Phase: Failed extraction image details: {failed_extraction_images}")

    return {
        "successfully_extracted_courses": final_successful_courses,
        "failed_extraction_images": failed_extraction_images,
        "processed_image_file_ids": list(set(processed_image_file_ids))
    }


def generate_suggestions_from_known_courses(
    all_known_course_names_cleaned: List[str], 
    cleaned_to_original_map: Dict[str, str],    
    previous_user_data_list: Optional[List[Dict]] = None 
):
    user_processed_data_output: List[Dict[str, any]] = []
    llm_error_summary_for_output: Optional[str] = None
    
    cached_data_map: Dict[str, Dict[str, any]] = {}
    if previous_user_data_list:
        for prev_item in previous_user_data_list: 
            if "identified_course_name" in prev_item: 
                 cached_data_map[prev_item["identified_course_name"]] = prev_item 
    logging.info(f"Suggestions Phase: Built cache map from previous data with {len(cached_data_map)} entries. Keys are original full names.")

    courses_to_query_cohere_for_batch_cleaned: List[str] = []
    
    for cleaned_course_name in all_known_course_names_cleaned:
        original_full_name = cleaned_to_original_map.get(cleaned_course_name)
        if not original_full_name:
            logging.warning(f"Suggestions Phase: Could not find original name for cleaned name '{cleaned_course_name}' during cache check. Will proceed to query LLM for cleaned name.")
            courses_to_query_cohere_for_batch_cleaned.append(cleaned_course_name)
            continue

        if original_full_name in cached_data_map:
            logging.info(f"Suggestions Phase: Cache hit for original name '{original_full_name}' (via cleaned '{cleaned_course_name}'). Using cached data.")
            user_processed_data_output.append({**cached_data_map[original_full_name], "processed_by": "Cache"})
        else:
            courses_to_query_cohere_for_batch_cleaned.append(cleaned_course_name) 
    
    parsed_cohere_batch_items_map: Dict[str, Dict[str, any]] = {}
    if courses_to_query_cohere_for_batch_cleaned:
        logging.info(f"Suggestions Phase: Querying Cohere LLM (batch) for {len(courses_to_query_cohere_for_batch_cleaned)} cleaned courses: {courses_to_query_cohere_for_batch_cleaned}")
        cohere_batch_response_data = query_llm_for_detailed_suggestions(courses_to_query_cohere_for_batch_cleaned)
        
        if "text" in cohere_batch_response_data and cohere_batch_response_data["text"]:
            parsed_cohere_batch_items = parse_llm_detailed_suggestions_response(cohere_batch_response_data["text"])
            parsed_cohere_batch_items_map = {item["identified_course_name_from_llm"]: item for item in parsed_cohere_batch_items}
            if not parsed_cohere_batch_items and courses_to_query_cohere_for_batch_cleaned: 
                 llm_error_summary_for_output = "Cohere LLM (batch) response received but no valid items could be parsed. Check LLM output format and server logs."
                 logging.warning(f"Suggestions Phase (Cohere Batch): {llm_error_summary_for_output}")
        elif "error" in cohere_batch_response_data:
            llm_error_summary_for_output = f"Cohere LLM (batch) error: {cohere_batch_response_data['error']}"
            logging.error(f"Suggestions Phase: Cohere LLM (batch) query failed: {llm_error_summary_for_output}")
        else: 
            llm_error_summary_for_output = "Unexpected response structure from Cohere LLM (batch) query function."
            logging.error(f"Suggestions Phase (Cohere Batch): {llm_error_summary_for_output}")

    for cleaned_course_name_queried_in_batch in courses_to_query_cohere_for_batch_cleaned:
        original_full_name_for_output = cleaned_to_original_map.get(cleaned_course_name_queried_in_batch, cleaned_course_name_queried_in_batch) 
        cohere_item_for_course = parsed_cohere_batch_items_map.get(cleaned_course_name_queried_in_batch) 

        if cohere_item_for_course:
            user_processed_data_output.append({
                "identified_course_name": original_full_name_for_output, 
                "description_from_graph": course_graph.get(cleaned_course_name_queried_in_batch, {}).get("description"), 
                "ai_description": cohere_item_for_course.get("ai_description"),
                "llm_suggestions": cohere_item_for_course.get("llm_suggestions", []),
                "llm_error": None,
                "processed_by": "Cohere (batch)"
            })
        else: 
            error_msg_for_this_course = f"Cohere (batch): LLM was queried for '{cleaned_course_name_queried_in_batch}', but no specific data was returned or parsed for it."
            if llm_error_summary_for_output and "parsed" in llm_error_summary_for_output: 
                error_msg_for_this_course = f"Cohere (batch): {llm_error_summary_for_output}"
            elif llm_error_summary_for_output and "error" in llm_error_summary_for_output.lower():
                 error_msg_for_this_course = llm_error_summary_for_output

            logging.warning(f"No Cohere (batch) data for '{cleaned_course_name_queried_in_batch}' (original: '{original_full_name_for_output}'). Error: {error_msg_for_this_course}")
            user_processed_data_output.append({
                "identified_course_name": original_full_name_for_output,
                "description_from_graph": course_graph.get(cleaned_course_name_queried_in_batch, {}).get("description"),
                "ai_description": None,
                "llm_suggestions": [],
                "llm_error": error_msg_for_this_course,
                "processed_by": "Cohere (batch failed)" 
            })
    
    final_user_processed_data_after_fallback = []
    any_individual_fallback_errors = False

    for course_data_item in user_processed_data_output:
        is_cohere_batch_failure_for_item = course_data_item.get("processed_by") == "Cohere (batch failed)" and \
                                           course_data_item.get("llm_error") is not None
        
        original_course_name_for_display = course_data_item['identified_course_name']
        cleaned_name_for_individual_query = original_course_name_for_display.replace(" [UNVERIFIED]", "").replace("¢", "").strip()

        if is_cohere_batch_failure_for_item and cleaned_name_for_individual_query:
            logging.info(f"Suggestions Phase: Cohere (batch) failed for '{cleaned_name_for_individual_query}'. Attempting Cohere individual fallback. Batch error was: {course_data_item.get('llm_error')}")
            
            cohere_individual_response = query_llm_for_detailed_suggestions([cleaned_name_for_individual_query])
            
            current_item_individual_error = None
            individual_ai_description = None
            individual_suggestions = []
            parsed_individual_item = None

            if "text" in cohere_individual_response and cohere_individual_response["text"]:
                parsed_items = parse_llm_detailed_suggestions_response(cohere_individual_response["text"])
                if parsed_items:
                    parsed_individual_item = parsed_items[0] 
                    if parsed_individual_item.get("identified_course_name_from_llm", "").lower() == cleaned_name_for_individual_query.lower():
                        individual_ai_description = parsed_individual_item.get("ai_description")
                        individual_suggestions = parsed_individual_item.get("llm_suggestions", [])
                        if not individual_ai_description and not individual_suggestions:
                            current_item_individual_error = "Cohere (individual): Returned no description or suggestions."
                            any_individual_fallback_errors = True
                    else:
                        current_item_individual_error = f"Cohere (individual): Parsed, but identified course name mismatch ('{parsed_individual_item.get('identified_course_name_from_llm')}' vs '{cleaned_name_for_individual_query}')."
                        any_individual_fallback_errors = True
                else: 
                    current_item_individual_error = "Cohere (individual): Response received but no valid items could be parsed."
                    any_individual_fallback_errors = True
            elif "error" in cohere_individual_response:
                current_item_individual_error = f"Cohere (individual) Error: {cohere_individual_response['error']}"
                any_individual_fallback_errors = True
            else: 
                current_item_individual_error = "Cohere (individual): Unexpected response structure from LLM query function."
                any_individual_fallback_errors = True

            if current_item_individual_error: 
                final_user_processed_data_after_fallback.append({
                    **course_data_item, 
                    "llm_error": f"{course_data_item.get('llm_error', 'Cohere (batch) failed.')} {current_item_individual_error}",
                    "processed_by": "Cohere (batch & individual failed)"
                })
                logging.warning(f"Suggestions Phase: Cohere individual fallback FAILED or no useful data for '{cleaned_name_for_individual_query}'. Combined error: {final_user_processed_data_after_fallback[-1]['llm_error']}")
            else: 
                final_user_processed_data_after_fallback.append({
                    "identified_course_name": original_course_name_for_display,
                    "description_from_graph": course_data_item.get("description_from_graph"), 
                    "ai_description": individual_ai_description,
                    "llm_suggestions": individual_suggestions,
                    "llm_error": None, 
                    "processed_by": "Cohere (individual fallback)"
                })
                logging.info(f"Suggestions Phase: Cohere individual fallback SUCCEEDED for '{cleaned_name_for_individual_query}'. Desc: {'Yes' if individual_ai_description else 'No'}, Sugs: {len(individual_suggestions)}")
        else:
            final_user_processed_data_after_fallback.append(course_data_item) 
    
    user_processed_data_output = final_user_processed_data_after_fallback
    user_processed_data_output.sort(key=lambda x: x.get("identified_course_name", "").lower())

    final_llm_error_summary = llm_error_summary_for_output 
    if any_individual_fallback_errors:
        individual_fallback_error_msg = "Some courses also failed individual Cohere fallback or Cohere returned no useful data. Check individual item errors and logs."
        if final_llm_error_summary:
            final_llm_error_summary += f" {individual_fallback_error_msg}"
        else:
            final_llm_error_summary = individual_fallback_error_msg
            
    return {
        "user_processed_data": user_processed_data_output,
        "llm_error_summary": final_llm_error_summary
    }


# Main orchestrator function
def extract_and_recommend_courses_from_image_data(
    image_data_list: Optional[List[Dict[str, any]]] = None, 
    mode: str = 'ocr_only', 
    known_course_names: Optional[List[str]] = None, 
    previous_user_data_list: Optional[List[Dict[str, any]]] = None,
    additional_manual_courses: Optional[List[str]] = None 
):
    if mode == 'ocr_only':
        current_additional_manual_courses = additional_manual_courses if isinstance(additional_manual_courses, list) else []
        current_image_data_list = image_data_list if isinstance(image_data_list, list) else []

        if not current_image_data_list and not current_additional_manual_courses:
            logging.info("OCR Phase: No images and no general manual courses provided.")
            return {
                "successfully_extracted_courses": [], 
                "failed_extraction_images": [],
                "processed_image_file_ids": [] 
            }
        
        ocr_results = process_images_for_ocr(current_image_data_list)
        
        current_successful_courses = ocr_results.get("successfully_extracted_courses", [])
        if current_additional_manual_courses:
            for manual_course in current_additional_manual_courses:
                clean_manual_course = manual_course.strip() 
                verified_manual_courses = filter_and_verify_course_text(clean_manual_course)
                for vmc in verified_manual_courses:
                    if vmc not in current_successful_courses:
                        current_successful_courses.append(vmc)
            ocr_results["successfully_extracted_courses"] = sorted(list(set(current_successful_courses)))

        logging.info(f"OCR Phase complete. Successfully extracted: {len(ocr_results.get('successfully_extracted_courses',[]))}, Failed images (need manual input): {len(ocr_results.get('failed_extraction_images',[]))}")
        return ocr_results

    elif mode == 'suggestions_only':
        consolidated_raw_names: List[str] = []
        if isinstance(known_course_names, list):
            consolidated_raw_names.extend(known_course_names)
        if isinstance(additional_manual_courses, list): 
            consolidated_raw_names.extend(additional_manual_courses)
        
        unique_raw_names = sorted(list(set(filter(None, consolidated_raw_names))))

        cleaned_names_for_llm_query: List[str] = []
        cleaned_to_original_map: Dict[str, str] = {} 

        for raw_name in unique_raw_names:
            cleaned_name = raw_name.replace(" [UNVERIFIED]", "").replace("¢", "").strip()
            if cleaned_name: 
                if cleaned_name not in cleaned_to_original_map: 
                    cleaned_names_for_llm_query.append(cleaned_name)
                    cleaned_to_original_map[cleaned_name] = raw_name 
            elif raw_name: 
                 logging.warning(f"Suggestions Phase Init: Raw course name '{raw_name}' became empty after cleaning. It will be skipped for LLM suggestions.")
        
        final_cleaned_names_for_llm = sorted(list(set(cleaned_names_for_llm_query)))

        if not final_cleaned_names_for_llm:
            logging.warning("Suggestions Phase: No valid course names remaining after cleaning for suggestion generation.")
            return {
                "user_processed_data": [], 
                "llm_error_summary": "No course names provided for suggestion generation (after cleaning)."
            }
        
        logging.info(f"Suggestions Phase: Generating suggestions for {len(final_cleaned_names_for_llm)} cleaned known courses (will map to originals): {final_cleaned_names_for_llm}")
        
        current_previous_user_data_list = previous_user_data_list if isinstance(previous_user_data_list, list) else None
        
        suggestion_results = generate_suggestions_from_known_courses(
            all_known_course_names_cleaned=final_cleaned_names_for_llm, 
            cleaned_to_original_map=cleaned_to_original_map, 
            previous_user_data_list=current_previous_user_data_list
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
    
    try:
        blank_image_path = os.path.join(test_image_folder, "blank_image.png")
        if not os.path.exists(blank_image_path):
            img = Image.new('RGB', (600, 400), color = 'white') 
            from PIL import ImageDraw, ImageFont
            draw = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype("arial.ttf", 20)
            except IOError:
                font = ImageFont.load_default()
            draw.text((10,10), "This is a blank test image\nNo course here.\nMaybe some random words like: introduction, project, final.", fill=(0,0,0), font=font)
            img.save(blank_image_path)
            logging.info(f"Created/updated blank test image with text: {blank_image_path}")

        python_cert_path = os.path.join(test_image_folder, "python_cert_mock.png")
        if not os.path.exists(python_cert_path):
            py_img = Image.new('RGB', (800, 600), color='lightyellow')
            draw = ImageDraw.Draw(py_img)
            try:
                title_font = ImageFont.truetype("arialbd.ttf", 40) 
                body_font = ImageFont.truetype("arial.ttf", 24)
            except IOError:
                title_font = ImageFont.load_default()
                body_font = ImageFont.load_default()
            
            draw.text((50, 50), "Certificate of Completion", font=title_font, fill="blue")
            draw.text((50, 150), "This certifies that", font=body_font, fill="black")
            draw.text((50, 200), "John Doe", font=title_font, fill="darkgreen")
            draw.text((50, 280), "has successfully completed the course", font=body_font, fill="black")
            draw.text((50, 330), "Introduction to Python Programming", font=title_font, fill="red")
            draw.text((50, 400), "on " + datetime.now(timezone.utc).strftime("%B %d, %Y"), font=body_font, fill="black")
            py_img.save(python_cert_path)
            logging.info(f"Created mock Python certificate: {python_cert_path}")

    except Exception as e:
        logging.error(f"Could not create test images: {e}")

    print("\n--- Testing OCR Only Mode (with LLM fallback) ---")
    test_img_data = []
    if os.path.exists(blank_image_path):
        with open(blank_image_path, "rb") as f: img_bytes = f.read()
        test_img_data.append({
            "bytes": img_bytes, "original_filename": "blank_image.png", 
            "content_type": "image/png", "file_id": "blank_id_1"
        })
    
    if os.path.exists(python_cert_path):
       with open(python_cert_path, "rb") as f: py_bytes = f.read()
       test_img_data.append({"bytes": py_bytes, "original_filename": "python_cert_mock.png", "content_type": "image/png", "file_id": "python_mock_id_1"})
    else:
        logging.warning(f"Mock Python certificate '{python_cert_path}' not found. Test may be less effective.")

    ocr_results = extract_and_recommend_courses_from_image_data(
        image_data_list=test_img_data,
        mode='ocr_only',
        additional_manual_courses=["Manual Test Course 1", "Problematic Course ¢ Name [UNVERIFIED]"] 
    )
    print("OCR Results (Local Test with LLM fallback):")
    print(json.dumps(ocr_results, indent=2))

    print("\n--- Testing Suggestions Only Mode (using results from OCR or mocked) ---")
    known_courses_for_suggestions = ocr_results.get("successfully_extracted_courses", [])
    if not known_courses_for_suggestions: 
        known_courses_for_suggestions.append("Python Programming [UNVERIFIED]") 
        known_courses_for_suggestions.append("A completely fake course for testing failure")
        
    if not any("Python" in s.lower() for s in known_courses_for_suggestions): 
        known_courses_for_suggestions.append("Python Programming") 
    if not any("Manual Test Course 1" in s for s in known_courses_for_suggestions): 
         known_courses_for_suggestions.append("Manual Test Course 1") 
    
    known_courses_for_suggestions.append("Internet Of Things(Iot With Cloud) ¢ [UNVERIFIED]")
    known_courses_for_suggestions.append("Super Specific Niche Course That LLMs Wont Know") 
    known_courses_for_suggestions.append("Typescript") # Add Typescript for testing


    mock_previous_run_data = [
        {
            "identified_course_name": "Python Programming", 
            "description_from_graph": course_graph.get("Python",{}).get("description"),
            "ai_description": "This is a cached AI description for Python Programming.",
            "llm_suggestions": [
                {"name": "Cached Advanced Python", "description": "Deep dive into Python from cache.", "url": "http://example.com/cached-adv-python"},
            ],
            "llm_error": None,
            "processed_by": "Cache"
        }
    ]
    

    suggestion_results = extract_and_recommend_courses_from_image_data(
        mode='suggestions_only',
        known_course_names=known_courses_for_suggestions, 
        previous_user_data_list=mock_previous_run_data
    )
    print("\nSuggestion Results (Local Test with Cohere individual fallback):")
    print(json.dumps(suggestion_results, indent=2))

    if not COHERE_API_KEY:
        print("\nNOTE: Cohere API key not set. LLM calls were skipped in relevant tests.")
    if not os.getenv("POPPLER_PATH") and not shutil.which("pdftoppm"):
        logging.warning("Local test: Poppler (pdftoppm) not found. PDF processing in tests might be skipped.")
    if not model:
        logging.warning("Local test: YOLO model ('best.pt') could not be loaded. OCR functionality will be limited.")
    if not TESSERACT_PATH:
         logging.warning("Local test: Tesseract executable not found. OCR will fail.")

