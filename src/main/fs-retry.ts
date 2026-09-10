import fs from 'fs';

export const renameFileWithRetry = async (sourcePath, destinationPath, maxAttempts = 6) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.promises.rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      const isRetryable = ['EBUSY', 'EPERM', 'EACCES'].includes(error?.code);
      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
};

export const removeFileWithRetry = async (filePath, maxAttempts = 6) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.promises.unlink(filePath);
      return;
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      const isRetryable = ['EBUSY', 'EPERM', 'EACCES'].includes(error?.code);
      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
};
