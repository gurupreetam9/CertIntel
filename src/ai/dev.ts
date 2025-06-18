import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-image-tags.ts';
import '@/ai/flows/generate-image-description.ts';
import '@/ai/flows/initiate-email-otp.ts';
import '@/ai/flows/verify-email-otp-and-register.ts';
// Removed import for '@/ai/flows/generate-course-suggestions-gemini.ts';
