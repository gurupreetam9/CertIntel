import { ref, uploadBytesResumable, getDownloadURL, type StorageError, type UploadTaskSnapshot } from 'firebase/storage';
import { storage } from './config';

interface UploadFileResult {
  downloadURL: string;
  filePath: string; // Full path in Firebase Storage
}

export const uploadFileToFirebase = (
  file: File,
  path: string, // This is the intended full filePath
  onProgress: (progress: number) => void
): Promise<UploadFileResult> => {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error: StorageError) => {
        console.error(
          'Firebase Storage Upload failed:', 
          { 
            code: error.code, 
            message: error.message, 
            serverResponse: error.serverResponse,
            name: error.name,
          }
        );
        
        let friendlyMessage = 'Upload failed. Please try again.';
        switch (error.code) {
            case 'storage/unauthorized':
                friendlyMessage = 'Permission denied. Please check Firebase Storage rules and ensure you are authenticated.';
                break;
            case 'storage/canceled':
                friendlyMessage = 'Upload canceled by the user.';
                break;
            case 'storage/object-not-found':
                friendlyMessage = 'File not found. This can happen if the file was deleted during upload.';
                 break;
            case 'storage/bucket-not-found':
                friendlyMessage = 'Storage bucket not found. Check Firebase project configuration.';
                break;
            case 'storage/project-not-found':
                friendlyMessage = 'Firebase project not found. Check configuration.';
                break;
            case 'storage/quota-exceeded':
                friendlyMessage = 'Storage quota exceeded. Please contact the administrator.';
                break;
            case 'storage/unauthenticated':
                friendlyMessage = 'User is not authenticated. Please log in and try again.';
                break;
            case 'storage/retry-limit-exceeded':
                friendlyMessage = 'Upload timed out after multiple retries. Check your internet connection.';
                break;
            case 'storage/invalid-checksum':
                friendlyMessage = 'File corruption detected during upload. Please try again.';
                break;
            case 'storage/unknown':
            default:
                friendlyMessage = 'An unknown error occurred during upload. Check console for details.';
                break;
        }
        // Reject with an object that includes the original error and a user-friendly message
        reject({ ...error, friendlyMessage });
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ downloadURL, filePath: path });
        } catch (error) {
          console.error('Failed to get download URL after upload:', error);
          reject(error as StorageError);
        }
      }
    );
  });
};
