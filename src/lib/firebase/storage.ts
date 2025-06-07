import { ref, uploadBytesResumable, getDownloadURL, type StorageError, type UploadTaskSnapshot } from 'firebase/storage';
import { storage } from './config';

interface UploadFileResult {
  downloadURL: string;
  filePath: string;
}

export const uploadFileToFirebase = (
  file: File,
  path: string,
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
        console.error('Upload failed:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ downloadURL, filePath: path });
        } catch (error) {
          console.error('Failed to get download URL:', error);
          reject(error as StorageError);
        }
      }
    );
  });
};
