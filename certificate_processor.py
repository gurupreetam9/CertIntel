
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
        "next_courses_for_graph_display_only": ["CSS", "JavaScript"],
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

def query_llm_for_suggestions(completed_course_name):
    if not co:
        logging.warning("Cohere client not initialized. Skipping LLM suggestions.")
        return {"error": "Cohere LLM not available."}
    if not completed_course_name:
        logging.warning("No completed course name provided to LLM for suggestions.")
        return {"error": "No completed course name provided for suggestions."}

    prompt = f"""
        The user has completed the course: "{completed_course_name}".
        Suggest up to 3 relevant next courses that would build upon it or are related.
        For each suggested course, you MUST provide its name, a brief 1-2 sentence description, and a URL.
        
        Your response MUST be only a list of suggestions.
        Each suggestion MUST be in the following strict format, with each piece of information on a new line:
        Name: [Suggested Course Name]
        Description: [Brief 1-2 sentence description of the suggested course]
        URL: [Link to take this suggested course]
        ---
        (Repeat for other suggestions, separating them with "---")

        If no relevant suggestions can be found, or if "{completed_course_name}" is too vague or not a real course, respond with ONLY the text: "No suggestions available." and nothing else.
        Do NOT include any other preambles, summaries, or explanations.
        
        Example of a valid response with suggestions:
        Name: Advanced Python Programming
        Description: Delve deeper into Python with advanced topics like asynchronous programming, metaclasses, and performance optimization.
        URL: https://example.com/advanced-python
        ---
        Name: Machine Learning with Python
        Description: Learn the fundamentals of machine learning and apply them using Python libraries like scikit-learn and TensorFlow.
        URL: https://example.com/ml-python
        
        Example of a valid response if no suggestions:
        No suggestions available.
        """
    try:
        response = co.chat(model="command-r-plus", message=prompt, temperature=0.3)
        logging.info(f"Cohere LLM raw response for '{completed_course_name}': {response.text[:500]}...")
        return {"text": response.text.strip()}
    except Exception as e:
        logging.error(f"Error querying Cohere LLM for '{completed_course_name}': {e}")
        return {"error": f"Error from LLM: {str(e)}"}

def parse_llm_suggestions_response(llm_response_text):
    suggestions_list = []
    if not llm_response_text or \
       llm_response_text.strip().lower() == "cohere llm not available." or \
       llm_response_text.strip().lower().startswith("error from llm:") or \
       llm_response_text.strip().lower() == "no completed course name provided for suggestions." or \
       llm_response_text.strip().lower() == "no suggestions available.":
        logging.warning(f"LLM response indicates no suggestions or an error: {llm_response_text}")
        return suggestions_list

    # Strip common leading list characters and trim whitespace
    cleaned_response_text = re.sub(r"^\s*[-*]\s*", "", llm_response_text.strip(), flags=re.MULTILINE)

    suggestion_blocks = re.split(r'\s*---\s*', cleaned_response_text)
    logging.info(f"LLM Parser: Split into {len(suggestion_blocks)} suggestion blocks from cleaned text.")

    for block_text in suggestion_blocks:
        block_text = block_text.strip()
        if not block_text:
            continue
        
        # More flexible regex to find Name, Description, URL, allowing for various separators and optional newlines.
        # It captures content after "Name:", "Description:", and "URL:".
        match = re.search(
            r"Name:\s*(?P<name>.*?)(?:\n|$)(\s*Description:\s*(?P<description>.*?)(?:\n|$))?(\s*URL:\s*(?P<url>https?://\S+))?",
            block_text,
            re.IGNORECASE | re.DOTALL
        )

        if match:
            name = match.group("name").strip() if match.group("name") else None
            description = match.group("description").strip() if match.group("description") else None
            url = match.group("url").strip() if match.group("url") else None

            # Further cleaning if description or URL got captured in the name
            if name and description and name.endswith(description) and len(description)>10: # only strip if desc is substantial
                name = name[:-len(description)].strip()
            if name and url and name.endswith(url):
                name = name[:-len(url)].strip()
            if description and url and description.endswith(url) and len(url)>10: # only strip if url is substantial
                description = description[:-len(url)].strip()
            
            if name and description and url: # All three are mandatory for a valid suggestion
                suggestions_list.append({
                    "name": name,
                    "description": description,
                    "url": url
                })
                logging.info(f"LLM Parser: Added suggestion: Name='{name}', Desc='{description[:30]}...', URL='{url}'")
            else:
                logging.warning(f"LLM Parser: Could not parse complete suggestion (Name, Desc, URL missing) from block: '{block_text[:100]}...'. Name: {name}, Desc: {description is not None}, URL: {url is not None}")
        else:
            logging.warning(f"LLM Parser: Regex found no match in block: '{block_text[:100]}...'")
            
    return suggestions_list


def extract_and_recommend_courses_from_image_data(
    image_data_list, 
    previous_user_data_list=None,
    additional_manual_courses=None 
):
    all_extracted_raw_texts = []
    processed_image_file_ids = []
    failed_extraction_images = [] # To store info about images where OCR failed

    for image_data in image_data_list:
        logging.info(f"--- Processing image: {image_data['original_filename']} (Type: {image_data['content_type']}, ID: {image_data.get('file_id', 'N/A')}) ---")
        current_file_id = str(image_data.get('file_id', 'N/A'))
        if current_file_id != 'N/A':
            processed_image_file_ids.append(current_file_id)

        pil_images_to_process = []
        try:
            if image_data['content_type'] == 'application/pdf':
                if not os.getenv("POPPLER_PATH") and not shutil.which("pdftoppm"):
                    logging.error("Poppler not found. Cannot convert PDF for {image_data['original_filename']}.")
                    if current_file_id != 'N/A':
                        failed_extraction_images.append({
                            "file_id": current_file_id,
                            "original_filename": image_data['original_filename'],
                            "reason": "Poppler not found for PDF conversion"
                        })
                    continue 
                pdf_pages = convert_from_bytes(image_data['bytes'], dpi=300, poppler_path=os.getenv("POPPLER_PATH"))
                pil_images_to_process.extend(pdf_pages)
                logging.info(f"Converted PDF '{image_data['original_filename']}' to {len(pdf_pages)} image(s).")
            elif image_data['content_type'].startswith('image/'):
                img_object = Image.open(io.BytesIO(image_data['bytes']))
                pil_images_to_process.append(img_object)
            else:
                logging.warning(f"Unsupported content type '{image_data['content_type']}' for file {image_data['original_filename']}. Skipping.")
                if current_file_id != 'N/A':
                     failed_extraction_images.append({
                        "file_id": current_file_id,
                        "original_filename": image_data['original_filename'],
                        "reason": f"Unsupported content type: {image_data['content_type']}"
                    })
                continue
        except UnidentifiedImageError:
            logging.error(f"Cannot identify image file {image_data['original_filename']}. Skipping.")
            if current_file_id != 'N/A':
                failed_extraction_images.append({
                    "file_id": current_file_id,
                    "original_filename": image_data['original_filename'],
                    "reason": "Cannot identify image file (UnidentifiedImageError)"
                })
            continue
        except Exception as e: 
            logging.error(f"Error converting/loading {image_data['original_filename']}: {e}", exc_info=True)
            reason = f"Conversion/load error: {str(e)}"
            if "poppler" in str(e).lower():
                 logging.critical("Poppler utilities might not be installed or found for {image_data['original_filename']}.")
                 reason = "Poppler error during PDF conversion"
            if current_file_id != 'N/A':
                failed_extraction_images.append({
                    "file_id": current_file_id,
                    "original_filename": image_data['original_filename'],
                    "reason": reason
                })
            continue
        
        current_file_texts_extracted = []
        for i, pil_img in enumerate(pil_images_to_process):
            if pil_img.mode == 'RGBA': pil_img = pil_img.convert('RGB')
            elif pil_img.mode == 'P': pil_img = pil_img.convert('RGB') 
            elif pil_img.mode == 'L': pil_img = pil_img.convert('RGB') 

            course_text = infer_course_text_from_image_object(pil_img)
            if course_text:
                current_file_texts_extracted.append(course_text)
        
        if not current_file_texts_extracted and current_file_id != 'N/A' and pil_images_to_process: # Only mark as failed if there were images to process
            # Check if it wasn't already added due to conversion error
            if not any(f['file_id'] == current_file_id for f in failed_extraction_images):
                failed_extraction_images.append({
                    "file_id": current_file_id,
                    "original_filename": image_data['original_filename'],
                    "reason": "No text extracted by OCR from image content"
                })
        elif current_file_texts_extracted:
            all_extracted_raw_texts.extend(current_file_texts_extracted)

    processed_course_mentions = []
    for raw_text_blob in all_extracted_raw_texts:
        filtered = filter_and_verify_course_text(raw_text_blob)
        processed_course_mentions.extend(filtered)

    unique_identified_courses = sorted(list(set(processed_course_mentions)))
    if additional_manual_courses:
        for manual_course in additional_manual_courses:
            clean_manual_course = manual_course.strip() 
            if clean_manual_course and clean_manual_course not in unique_identified_courses:
                unique_identified_courses.append(clean_manual_course)
        unique_identified_courses = sorted(list(set(unique_identified_courses)))
    logging.info(f"Final unique identified courses for processing: {unique_identified_courses}")

    cached_suggestions_map = {}
    if previous_user_data_list:
        for prev_item in previous_user_data_list:
            if "identified_course_name" in prev_item and "llm_suggestions" in prev_item:
                 cached_suggestions_map[prev_item["identified_course_name"]] = prev_item["llm_suggestions"]
    logging.info(f"Built cache map from previous data: {len(cached_suggestions_map)} entries.")

    user_processed_data_output = []
    llm_error_summary_for_output = None # For overall LLM issues, if any

    for identified_course in unique_identified_courses:
        clean_identified_course_name = identified_course.replace(" [UNVERIFIED]", "").strip()
        
        description_from_graph = None
        if clean_identified_course_name in course_graph:
            description_from_graph = course_graph[clean_identified_course_name].get("description")
        
        llm_suggestions_for_this_course = []
        llm_error_message_for_this_course = None

        if clean_identified_course_name in cached_suggestions_map:
            logging.info(f"Using cached suggestions for '{clean_identified_course_name}'.")
            llm_suggestions_for_this_course = cached_suggestions_map[clean_identified_course_name]
        else:
            logging.info(f"No cache hit for '{clean_identified_course_name}'. Querying LLM...")
            llm_response_data = query_llm_for_suggestions(clean_identified_course_name)
            
            if "error" in llm_response_data:
                llm_error_message_for_this_course = llm_response_data["error"]
                logging.warning(f"LLM query failed for '{clean_identified_course_name}': {llm_error_message_for_this_course}")
                if not llm_error_summary_for_output: llm_error_summary_for_output = llm_error_message_for_this_course # Capture first general error
            elif "text" in llm_response_data:
                if llm_response_data["text"].strip().lower() == "no suggestions available.":
                    logging.info(f"LLM indicated 'No suggestions available' for '{clean_identified_course_name}'.")
                    llm_error_message_for_this_course = "LLM indicated no specific suggestions are available for this course."
                else:
                    parsed_sugs = parse_llm_suggestions_response(llm_response_data["text"])
                    if parsed_sugs:
                        llm_suggestions_for_this_course = parsed_sugs
                    else:
                        llm_error_message_for_this_course = f"LLM response for '{clean_identified_course_name}' was received ('{llm_response_data['text'][:50]}...') but no valid suggestions could be parsed."
                        logging.warning(llm_error_message_for_this_course)
                        if not llm_error_summary_for_output: llm_error_summary_for_output = "LLM response format issue, check logs."
            else:
                llm_error_message_for_this_course = f"Unexpected LLM response format for '{clean_identified_course_name}'."
                logging.error(llm_error_message_for_this_course)
                if not llm_error_summary_for_output: llm_error_summary_for_output = llm_error_message_for_this_course

        user_processed_data_output.append({
            "identified_course_name": identified_course,
            "description_from_graph": description_from_graph,
            "llm_suggestions": llm_suggestions_for_this_course,
            "llm_error": llm_error_message_for_this_course if llm_error_message_for_this_course else None
        })
    
    # Filter out failed_extraction_images that actually led to identified courses (e.g., via manual input mapping to same name)
    # This is complex if manual input isn't directly tied to a file_id.
    # For now, return all images where direct OCR failed. The user can choose to ignore naming if a manual entry covered it.
    
    return {
        "user_processed_data": user_processed_data_output,
        "processed_image_file_ids": list(set(processed_image_file_ids)),
        "failed_extraction_images": failed_extraction_images,
        "llm_error_summary": llm_error_summary_for_output
    }

# --- Main (for local testing) ---
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Create a dummy image file for testing failed_extraction_images
    test_image_folder = "test_images_for_failed_extraction" 
    if not os.path.exists(test_image_folder):
        os.makedirs(test_image_folder)
    
    dummy_image_path = os.path.join(test_image_folder, "blank_image.png")
    if not os.path.exists(dummy_image_path):
        try:
            # Create a small blank PNG image that likely won't have OCR text
            blank_img = Image.new('RGB', (100, 100), color = 'white')
            blank_img.save(dummy_image_path)
            print(f"Created dummy blank image at '{dummy_image_path}' for testing.")
        except Exception as e:
            print(f"Could not create dummy blank image: {e}")

    test_data_list = []
    if os.path.exists(dummy_image_path):
        with open(dummy_image_path, "rb") as f:
            img_bytes = f.read()
        test_data_list.append({
            "bytes": img_bytes, 
            "original_filename": "blank_image.png", 
            "content_type": "image/png", 
            "file_id": "blank_image_test_id_123"
        })
    
    # Example of a PDF that might be hard to parse
    # test_data_list.append({"bytes": pdf_bytes, "original_filename": "complex.pdf", "content_type": "application/pdf", "file_id": "pdf_test_id_456"})


    mock_previous_data_for_cache = [
         {
            "identified_course_name": "Python", 
            "description_from_graph": "Python is a versatile programming language...",
            "llm_suggestions": [
                {"name": "Cached Flask Suggestion", "description": "This is a cached Flask description.", "url": "http://cached.example.com/flask"}
            ],
            "llm_error": None
        }
    ]
    mock_manual_courses = ["Advanced Data Analysis", "TensorFlow Basics"] 
        
    if test_data_list or mock_manual_courses:
        print(f"Locally testing with {len(test_data_list)} images and manual courses: {mock_manual_courses}...")
        
        results = extract_and_recommend_courses_from_image_data(
            test_data_list, 
            previous_user_data_list=mock_previous_data_for_cache, 
            additional_manual_courses=mock_manual_courses
        )
        
        print("\n\n=== FINAL RESULTS (Local Test) ===")
        print(json.dumps(results, indent=2))
        if results.get("failed_extraction_images"):
            print(f"\nDetected {len(results['failed_extraction_images'])} images with failed OCR/extraction.")

    else:
        print(f"No images found in '{test_image_folder}' and no manual courses for local test.")
    
    print("\n--- Testing LLM Suggestion for 'React' ---")
    llm_res = query_llm_for_suggestions("React")
    if "text" in llm_res:
        parsed = parse_llm_suggestions_response(llm_res["text"])
        print(json.dumps(parsed, indent=2))
    else:
        print(f"Error: {llm_res.get('error')}")
