
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
    nltk.data.find('corpora/words'); nltk.data.find('corpora/stopwords')
except nltk.downloader.DownloadError:
    nltk.download('words', quiet=True); nltk.download('stopwords', quiet=True)

english_vocab = set(w.lower() for w in nltk_words.words())
stop_words = set(stopwords.words('english'))
course_keywords = {"course", "certification", "developer", "programming", "bootcamp", "internship", "award", "degree", "diploma", "training"}
COHERE_API_KEY = "jrAUYREK77bel5TGil5uyrzogksRcSxP78v97egn"
co = cohere.Client(COHERE_API_KEY) if COHERE_API_KEY else None
if not co: logging.warning("COHERE_API_KEY not found. LLM features will be limited.")

TESSERACT_PATH = shutil.which("tesseract")
if not TESSERACT_PATH: logging.critical("Tesseract OCR not found in PATH. Pytesseract will fail.")
else: logging.info(f"Tesseract OCR found at: {TESSERACT_PATH}")

possible_courses = ["HTML", "CSS", "JavaScript", "React", "Astro.js", "Python", "Flask", "C Programming", "Kotlin", "Ethical Hacking", "Networking", "Node.js", "Machine Learning", "Data Structures", "Operating Systems", "Next.js", "Remix", "Express.js", "MongoDB", "Docker", "Kubernetes", "Tailwind CSS", "Django", "Typescript"]
course_graph = { # Simplified for brevity, keep your full graph
    "HTML": {"description": "HTML is for webpages.", "suggested_next_courses": []},
    "Python": {"description": "Python is versatile.", "suggested_next_courses": []}
}

YOLO_MODEL_PATH = "D:/CertIntel/certificate.v1i.yolov8(1)/runs/detect/exp/weights/best.pt"
model = None
try:
    # Define the model path relative to the current script file.
    yolo_model_path_relative = os.path.join(os.path.dirname(__file__), 'best.pt')
    if os.path.exists(yolo_model_path_relative):
        model = YOLO(yolo_model_path_relative)
        logging.info(f"Successfully loaded YOLO model from relative path: {yolo_model_path_relative}")
    else:
        logging.error(f"YOLO model 'best.pt' not found in the same directory as certificate_processor.py. Looked at path: {yolo_model_path_relative}. OCR performance will be degraded.")
except Exception as e:
    logging.error(f"Error loading YOLO model: {e}")

def clean_unicode(text): return text.encode("utf-8", "replace").decode("utf-8")

def query_llm_for_course_from_text(text_content: str) -> Optional[str]:
    if not co or not text_content or not text_content.strip(): return None
    prompt = f"Extract ONLY the most prominent course name from the text. If none, respond '[[NONE]]'. Text:\n---\n{text_content[:3000]}\n---\nExtracted Course Name:"
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.1)
        extracted = response.text.strip()
        if extracted.upper() == "[[NONE]]" or not extracted: return None
        return re.sub(r"^(course name:)\s*", "", extracted, flags=re.IGNORECASE)
    except Exception as e: logging.error(f"Cohere course extraction error: {e}"); return None

def infer_course_text_from_image_object(pil_image_obj: Image.Image) -> Tuple[List[str], str]:
    courses, status = [], "FAILURE_NO_COURSE_IDENTIFIED"
    if model and TESSERACT_PATH:
        try:
            img_np = np.array(pil_image_obj); img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2RGB if img_np.shape[2] == 4 else (cv2.COLOR_GRAY2RGB if img_np.ndim == 2 else None))
            results = model(img_np); names, boxes = results[0].names, results[0].boxes
            if boxes:
                for box in boxes:
                    if names[int(box.cls[0].item())].lower() in ["certificatecourse", "course", "title"]:
                        crop = pil_image_obj.crop(map(int, box.xyxy[0].cpu().numpy()))
                        text = clean_unicode(pytesseract.image_to_string(crop).strip())
                        if text: 
                            courses_from_region = filter_and_verify_course_text(text)
                            if courses_from_region: return list(set(courses_from_region)), "SUCCESS_YOLO_OCR"
        except Exception as yolo_err: logging.error(f"YOLO inference error: {yolo_err}", exc_info=True); status = "FAILURE_YOLO_ERROR"

    if not courses and TESSERACT_PATH:
        try:
            text = clean_unicode(pytesseract.image_to_string(pil_image_obj).strip())
            if text and len(text) >= 5:
                llm_course = query_llm_for_course_from_text(text)
                if llm_course: 
                    courses_from_llm = filter_and_verify_course_text(llm_course)
                    if courses_from_llm: return list(set(courses_from_llm)), "SUCCESS_LLM_EXTRACTION_FROM_FULL_OCR"
                status = "FAILURE_LLM_OUTPUT_FILTERED_EMPTY" if llm_course else "FAILURE_LLM_NO_COURSE_IN_TEXT"
            else: status = "FAILURE_FULL_IMAGE_OCR_NO_TEXT"
        except Exception as ocr_err: status = f"FAILURE_FULL_IMAGE_OCR_ERROR: {str(ocr_err).splitlines()[0]}"
    elif not TESSERACT_PATH: status = "FAILURE_TESSERACT_NOT_FOUND"
    return list(set(courses)), status

def extract_course_names_from_text(text):
    if not text: return []
    return list(set(c for c in possible_courses if re.search(r'\b' + re.escape(c.lower()) + r'\b', text.lower())))

def filter_and_verify_course_text(text_input: Optional[str]) -> List[str]:
    if not text_input or len(text_input.strip()) < 3: return []
    text = re.sub(r'\s*¢\s*', '', text_input.strip()).strip()
    if not text: return []
    temp_text = text.lower()
    for phrase in ["certificate of completion", "certificate of achievement", "is awarded to", "has successfully completed"]: temp_text = temp_text.replace(phrase, "")
    
    lines = [ln.strip() for ln in temp_text.split('\n') if len(ln.strip()) > 4]
    if len(text.split()) <= 7 and '\n' not in text: lines.append(text.lower())
    
    identified = extract_course_names_from_text(text)
    for line in lines:
        if not line or line in stop_words or any(pc.lower() in line for pc in identified): continue
        words = line.split()
        if (any(kw in line for kw in course_keywords) and not all(w in course_keywords or w in stop_words or not w.isalnum() for w in words) and 2 <= len(words) <= 7 and any(w.lower() not in stop_words and len(w) > 2 for w in words)) or \
           (len(text.split()) <= 7 and '\n' not in text and line == text.lower()):
            title_cased = line.title()
            if title_cased and title_cased not in identified: identified.append(f"{title_cased} [UNVERIFIED]")
    return list(set(identified))

def query_llm_for_detailed_suggestions(known_course_names_list_cleaned: List[str]):
    if not co or not known_course_names_list_cleaned: return {"error": "Cohere LLM not available or no courses provided."}
    prompt_courses = ', '.join(f"'{c}'" for c in known_course_names_list_cleaned)
    prompt = f"For EACH course in: {prompt_courses}, provide:\n1. \"Original Input Course: [Exact course name from input]\"\n2. \"AI Description: [1-2 sentence desc or 'No AI description available.']\"\n3. \"Suggested Next Courses:\"\n   - Name: [Suggested Course 1]\n   - Description: [Desc for Sug 1]\n   - URL: [URL for Sug 1]\n   (Repeat for 2-3 suggestions or 'No specific suggestions available...').\nSeparate main blocks with '---\\n'. Use http/https for URLs."
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.3)
        return {"text": response.text.strip()}
    except Exception as e: logging.error(f"Cohere suggestions error: {e}"); return {"error": f"Error from LLM: {str(e)}"}

def parse_llm_detailed_suggestions_response(llm_response_text: str) -> List[Dict[str, Union[str, None, List[Dict[str, str]]]]]:
    parsed = []
    if not llm_response_text or llm_response_text.strip().lower().startswith(("cohere llm not available", "error from llm", "no known course names")): return parsed
    blocks = re.split(r'\n---\n', llm_response_text.replace('\r\n', '\n').strip("```json\n").strip("```").strip())
    for block in blocks:
        if not block.strip(): continue
        orig_match = re.search(r"Original Input Course:\s*(.*?)\n", block, re.I)
        ai_desc_match = re.search(r"AI Description:\s*(.*?)(?:\nSuggested Next Courses:|\Z)", block, re.I | re.DOTALL)
        if not orig_match: logging.warning(f"LLM Parser: No 'Original Input Course' in block: {block[:100]}..."); continue
        
        orig_course = orig_match.group(1).strip()
        ai_desc = ai_desc_match.group(1).strip() if ai_desc_match and ai_desc_match.group(1).strip().lower() != "no ai description available." else None
        
        suggestions = []
        sug_blob_match = re.search(r"Suggested Next Courses:\n(.*?)$", block, re.I | re.DOTALL)
        if sug_blob_match:
            sug_blob = sug_blob_match.group(1).strip()
            if sug_blob.lower() != "no specific suggestions available for this course.":
                ind_sugs = re.split(r'\n(?:-\s*)?Name:', sug_blob)
                for i, part in enumerate(ind_sugs):
                    cleaned_part = part.strip()
                    if i == 0 and not cleaned_part and not sug_blob.lower().startswith("name:"): continue
                    full_sug_block = "Name: " + cleaned_part if not cleaned_part.lower().startswith("name:") else cleaned_part
                    
                    name_m = re.search(r"Name:\s*(.*?)\n", full_sug_block, re.I)
                    desc_m = re.search(r"Description:\s*(.*?)\n", full_sug_block, re.I | re.DOTALL)
                    url_m = re.search(r"URL:\s*(https?://\S+)", full_sug_block, re.I)
                    if name_m and desc_m and url_m: suggestions.append({"name": name_m.group(1).strip(), "description": desc_m.group(1).strip(), "url": url_m.group(1).strip()})
                    else: logging.warning(f"LLM Parser: Malformed suggestion for '{orig_course}': {full_sug_block[:100]}...")
        parsed.append({"original_input_course_from_llm": orig_course, "ai_description": ai_desc, "llm_suggestions": suggestions})
    return parsed

def generate_suggestions_from_known_courses(
    all_known_course_names_cleaned: List[str], 
    cleaned_to_original_map: Dict[str, str],    
    previous_user_data_list: Optional[List[Dict]] = None,
    force_refresh_for_courses: Optional[List[str]] = None
):
    output_data, llm_error_summary = [], None
    cache_map = {item["identified_course_name"]: item for item in previous_user_data_list or [] if "identified_course_name" in item}
    
    courses_to_query_cohere_batch = []
    for cleaned_name in all_known_course_names_cleaned:
        original_name = cleaned_to_original_map.get(cleaned_name, cleaned_name)
        is_forced_refresh = force_refresh_for_courses and cleaned_name in force_refresh_for_courses
        
        if original_name in cache_map and not is_forced_refresh:
            output_data.append({**cache_map[original_name], "processed_by": "Cache"})
        else:
            if is_forced_refresh: logging.info(f"Force refreshing suggestions for: {cleaned_name}")
            courses_to_query_cohere_batch.append(cleaned_name)
            
    parsed_cohere_batch_map = {}
    if courses_to_query_cohere_batch:
        cohere_batch_resp = query_llm_for_detailed_suggestions(courses_to_query_cohere_batch)
        if "text" in cohere_batch_resp and cohere_batch_resp["text"]:
            parsed_items = parse_llm_detailed_suggestions_response(cohere_batch_resp["text"])
            parsed_cohere_batch_map = {item["original_input_course_from_llm"].lower(): item for item in parsed_items if "original_input_course_from_llm" in item}
            if not parsed_items and courses_to_query_cohere_batch: llm_error_summary = "Cohere (batch) no items parsed."
        elif "error" in cohere_batch_resp: llm_error_summary = f"Cohere (batch) error: {cohere_batch_resp['error']}"
        else: llm_error_summary = "Unexpected Cohere (batch) response."

    for cleaned_name in courses_to_query_cohere_batch:
        original_name = cleaned_to_original_map.get(cleaned_name, cleaned_name)
        cohere_item = parsed_cohere_batch_map.get(cleaned_name.lower())
        if cohere_item:
            output_data.append({
                "identified_course_name": original_name, 
                "description_from_graph": course_graph.get(cleaned_name, {}).get("description"), 
                "ai_description": cohere_item.get("ai_description"),
                "llm_suggestions": cohere_item.get("llm_suggestions", []),
                "llm_error": None, "processed_by": "Cohere (batch)"
            })
        else:
            err_msg = f"Cohere (batch): No data for '{cleaned_name}'." + (f" Batch error: {llm_error_summary}" if llm_error_summary else "")
            output_data.append({"identified_course_name": original_name, "description_from_graph": course_graph.get(cleaned_name, {}).get("description"), "ai_description": None, "llm_suggestions": [], "llm_error": err_msg, "processed_by": "Cohere (batch failed)"})
            
    output_data.sort(key=lambda x: x.get("identified_course_name", "").lower())
    return {"user_processed_data": output_data, "llm_error_summary": llm_error_summary}


def get_course_recommendations(
    known_course_names: Optional[List[str]] = None, 
    previous_user_data_list: Optional[List[Dict[str, any]]] = None,
    additional_manual_courses: Optional[List[str]] = None,
    force_refresh_for_courses: Optional[List[str]] = None
):
    raw_names = list(set(filter(None, (known_course_names or []) + (additional_manual_courses or []))))
    cleaned_map = {}
    cleaned_for_llm = []
    for name in raw_names:
        cleaned = name.replace(" [UNVERIFIED]", "").replace("¢", "").strip()
        if cleaned and cleaned not in cleaned_map: cleaned_for_llm.append(cleaned); cleaned_map[cleaned] = name
        elif not cleaned and name: logging.warning(f"Suggestions: Raw name '{name}' empty after cleaning.")
    
    if not cleaned_for_llm: return {"user_processed_data": [], "llm_error_summary": "No valid courses for suggestions (after cleaning)."}
    
    return generate_suggestions_from_known_courses(
        cleaned_for_llm, cleaned_map, previous_user_data_list, force_refresh_for_courses
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Basic test for suggestions with force_refresh
    test_courses_cleaned = ["Python", "JavaScript"]
    test_cleaned_to_original = {"Python": "Python Programming [UNVERIFIED]", "JavaScript": "JavaScript for Web Devs"}
    test_previous_data = [{"identified_course_name": "Python Programming [UNVERIFIED]", "ai_description": "Old Python desc.", "llm_suggestions": [], "processed_by": "Cache"}]
    
    print("\n--- Test suggestions (no force refresh) ---")
    results_no_force = generate_suggestions_from_known_courses(test_courses_cleaned, test_cleaned_to_original, test_previous_data)
    print(json.dumps(results_no_force, indent=2))

    print("\n--- Test suggestions (force refresh Python) ---")
    results_force_python = generate_suggestions_from_known_courses(test_courses_cleaned, test_cleaned_to_original, test_previous_data, force_refresh_for_courses=["Python"])
    print(json.dumps(results_force_python, indent=2))
    
    if not COHERE_API_KEY: print("\nNOTE: Cohere API key not set. LLM calls were skipped.")

    