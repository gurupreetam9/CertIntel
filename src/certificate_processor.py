
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
import cohere
import json
import io
import shutil 
from typing import List, Optional, Tuple, Dict, Union
from datetime import datetime, timezone 

# --- Initial Setup ---
try:
    nltk.data.find('corpora/words')
except LookupError:
    nltk.download('words', quiet=True)

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)

english_vocab = set(w.lower() for w in nltk_words.words())
stop_words = set(stopwords.words('english'))
course_keywords = {"course", "certification", "developer", "programming", "bootcamp", "internship", "award", "degree", "diploma", "training"}

# --- Constants ---
COHERE_API_KEY = os.environ.get("COHERE_API_KEY")

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
    )
else:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
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

model = None
try:
    # Load model from a path relative to this script file for portability
    yolo_model_path_relative = os.path.join(os.path.dirname(__file__), 'best.pt')
    if os.path.exists(yolo_model_path_relative):
        model = YOLO(yolo_model_path_relative)
        model.to("cpu")
        logging.info(f"Successfully loaded YOLO model from relative path: {yolo_model_path_relative}")
    else:
        logging.error(f"YOLO model 'best.pt' not found in the same directory as certificate_processor.py. Looked at path: {yolo_model_path_relative}. OCR performance will be degraded.")
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
1.  "Original Input Course: [The exact course name from the input list that this block refers to. This must be an exact copy from the input list you received.]"
2.  "AI Description: [Generate a concise 1-2 sentence description for this course. If you cannot generate one, state 'No AI description available.']"
3.  "Suggested Next Courses:" (This line must be present)
    Then, for 2-3 relevant next courses that build upon the 'Original Input Course', provide:
    - "Name: [Suggested Course 1 Name]" (on a new line)
    - "Description: [Brief 1-2 sentence description for Suggested Course 1]" (on a new line)
    - "URL: [A valid, direct link to take Suggested Course 1]" (on a new line)
    (Repeat the Name, Description, URL lines for each of the 2-3 suggestions for this 'Original Input Course')

IMPORTANT FORMATTING RULES:
-   Separate each main "Original Input Course" block (meaning the block starting with "Original Input Course: ... AI Description: ... Suggested Next Courses: ...") with a line containing only "---".
-   If no relevant next courses can be suggested for a particular "Original Input Course", then under "Suggested Next Courses:", you MUST write "No specific suggestions available for this course." on a new line and nothing else for that suggestion part.
-   Do NOT include any other preambles, summaries, or explanations outside of this structure for each identified course.
-   Ensure URLs are complete and valid (e.g., start with http:// or https://).
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

        original_input_course_match = re.search(r"Original Input Course:\s*(.*?)\n", block_text, re.IGNORECASE)
        ai_description_match = re.search(r"AI Description:\s*(.*?)(?:\nSuggested Next Courses:|\Z)", block_text, re.IGNORECASE | re.DOTALL)
        
        if not original_input_course_match:
            logging.warning(f"LLM Parser: Could not find 'Original Input Course' in block. Full block text (first 300 chars): '{block_text[:300]}...'")
            continue
            
        original_input_course_from_llm = original_input_course_match.group(1).strip()
        
        ai_description = None
        if ai_description_match:
            desc_text = ai_description_match.group(1).strip()
            if desc_text.lower() != "no ai description available.":
                ai_description = desc_text
        
        current_suggestions = []
        suggestions_text_match = re.search(r"Suggested Next Courses:\n(.*?)$", block_text, re.IGNORECASE | re.DOTALL)
        
        if suggestions_text_match:
            suggestions_blob = suggestions_text_match.group(1).strip()
            if suggestions_blob.lower() != "no specific suggestions available for this course.":
                individual_suggestion_blocks = re.split(r'\n(?:-\s*)?Name:', suggestions_blob)
                
                for i, sug_block_part in enumerate(individual_suggestion_blocks):
                    sug_block_part_cleaned = sug_block_part.strip()
                    if i == 0 and not sug_block_part_cleaned and not suggestions_blob.strip().lower().startswith("name:"):
                        continue
                    
                    full_sug_block = "Name: " + sug_block_part_cleaned if not sug_block_part_cleaned.lower().startswith("name:") else sug_block_part_cleaned

                    sug_name_match = re.search(r"Name:\s*(.*?)\n", full_sug_block, re.IGNORECASE)
                    sug_desc_match = re.search(r"Description:\s*(.*?)\n", full_sug_block, re.IGNORECASE | re.DOTALL)
                    sug_url_match = re.search(r"URL:\s*(https?://\S+)", full_sug_block, re.IGNORECASE)

                    if sug_name_match and sug_desc_match and sug_url_match:
                        current_suggestions.append({
                            "name": sug_name_match.group(1).strip(),
                            "description": sug_desc_match.group(1).strip(),
                            "url": sug_url_match.group(1).strip()
                        })
        
        parsed_results.append({
            "original_input_course_from_llm": original_input_course_from_llm,
            "ai_description": ai_description,
            "llm_suggestions": current_suggestions
        })

    return parsed_results


def generate_suggestions_from_known_courses(
    all_known_course_names_cleaned: List[str], 
    cleaned_to_original_map: Dict[str, str],    
    previous_user_data_list: Optional[List[Dict]] = None,
    force_refresh_for_courses: Optional[List[str]] = None
):
    user_processed_data_output: List[Dict[str, any]] = []
    llm_error_summary_for_output: Optional[str] = None
    
    cached_data_map: Dict[str, Dict[str, any]] = {}
    if previous_user_data_list:
        for prev_item in previous_user_data_list: 
            if "identified_course_name" in prev_item: 
                 cached_data_map[prev_item["identified_course_name"]] = prev_item 
    logging.info(f"Suggestions Phase: Built cache map from previous data with {len(cached_data_map)} entries.")

    courses_to_query_cohere_for_batch_cleaned: List[str] = []
    
    for cleaned_course_name in all_known_course_names_cleaned:
        original_full_name = cleaned_to_original_map.get(cleaned_course_name)
        is_forced_refresh = force_refresh_for_courses and cleaned_course_name in force_refresh_for_courses

        if not original_full_name:
            courses_to_query_cohere_for_batch_cleaned.append(cleaned_course_name)
            continue

        if original_full_name in cached_data_map and not is_forced_refresh:
            user_processed_data_output.append({**cached_data_map[original_full_name], "processed_by": "Cache"})
        else:
            courses_to_query_cohere_for_batch_cleaned.append(cleaned_course_name) 
    
    parsed_cohere_batch_items_map: Dict[str, Dict[str, any]] = {}
    if courses_to_query_cohere_for_batch_cleaned:
        logging.info(f"Suggestions Phase: Querying Cohere LLM (batch) for {len(courses_to_query_cohere_for_batch_cleaned)} cleaned courses.")
        cohere_batch_response_data = query_llm_for_detailed_suggestions(courses_to_query_cohere_for_batch_cleaned)
        
        if "text" in cohere_batch_response_data and cohere_batch_response_data["text"]:
            parsed_cohere_batch_items = parse_llm_detailed_suggestions_response(cohere_batch_response_data["text"])
            parsed_cohere_batch_items_map = {
                item["original_input_course_from_llm"].lower(): item 
                for item in parsed_cohere_batch_items if "original_input_course_from_llm" in item
            }
            if not parsed_cohere_batch_items and courses_to_query_cohere_for_batch_cleaned: 
                 llm_error_summary_for_output = "Cohere LLM (batch) response received but no valid items could be parsed."
        elif "error" in cohere_batch_response_data:
            llm_error_summary_for_output = f"Cohere LLM (batch) error: {cohere_batch_response_data['error']}"
        else: 
            llm_error_summary_for_output = "Unexpected response structure from Cohere LLM (batch) query function."

    for cleaned_course_name_queried_in_batch in courses_to_query_cohere_for_batch_cleaned:
        original_full_name_for_output = cleaned_to_original_map.get(cleaned_course_name_queried_in_batch, cleaned_course_name_queried_in_batch) 
        cohere_item_for_course = parsed_cohere_batch_items_map.get(cleaned_course_name_queried_in_batch.lower()) 

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
            error_msg_for_this_course = f"Cohere (batch): LLM was queried for '{cleaned_course_name_queried_in_batch}', but no specific data was returned."
            if llm_error_summary_for_output:
                error_msg_for_this_course = f"Cohere (batch): {llm_error_summary_for_output}"

            user_processed_data_output.append({
                "identified_course_name": original_full_name_for_output,
                "description_from_graph": course_graph.get(cleaned_course_name_queried_in_batch, {}).get("description"),
                "ai_description": None,
                "llm_suggestions": [],
                "llm_error": error_msg_for_this_course,
                "processed_by": "Cohere (batch failed)" 
            })
    
    user_processed_data_output.sort(key=lambda x: x.get("identified_course_name", "").lower())
            
    return {
        "user_processed_data": user_processed_data_output,
        "llm_error_summary": llm_error_summary_for_output
    }


# Main entry point for getting course recommendations, called by Flask API
def get_course_recommendations(
    known_course_names: Optional[List[str]] = None, 
    previous_user_data_list: Optional[List[Dict[str, any]]] = None,
    force_refresh_for_courses: Optional[List[str]] = None
):
    consolidated_raw_names: List[str] = known_course_names if isinstance(known_course_names, list) else []
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
             logging.warning(f"Suggestions Phase Init: Raw course name '{raw_name}' became empty after cleaning.")
    
    if not cleaned_names_for_llm_query:
        logging.warning("Suggestions Phase: No valid course names remaining after cleaning for suggestion generation.")
        return {
            "user_processed_data": [], 
            "llm_error_summary": "No course names provided for suggestion generation (after cleaning)."
        }
    
    logging.info(f"Suggestions Phase: Generating suggestions for {len(cleaned_names_for_llm_query)} cleaned courses.")
    
    current_previous_user_data_list = previous_user_data_list if isinstance(previous_user_data_list, list) else None
    
    suggestion_results = generate_suggestions_from_known_courses(
        all_known_course_names_cleaned=cleaned_names_for_llm_query,
        cleaned_to_original_map=cleaned_to_original_map, 
        previous_user_data_list=current_previous_user_data_list,
        force_refresh_for_courses=force_refresh_for_courses
    )
    logging.info(f"Suggestions Phase complete. Processed data items: {len(suggestion_results.get('user_processed_data',[]))}, LLM summary: {suggestion_results.get('llm_error_summary')}")
    return suggestion_results
