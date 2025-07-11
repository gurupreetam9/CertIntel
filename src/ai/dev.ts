'use server';

import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-image-tags.ts';
import '@/ai/flows/generate-image-description.ts';
import '@/ai/flows/initiate-email-otp.ts';
import '@/ai/flows/verify-registration-otp.ts'; // Replaced old flow with new OTP verification
import '@/ai/flows/initiate-account-deletion.ts';
import '@/ai/flows/initiate-login-otp.ts';
// Removed import for '@/ai/flows/predict-next-words.ts'; 
// Removed import for '@/ai/flows/generate-course-suggestions-gemini.ts';
