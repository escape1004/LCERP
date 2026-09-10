export async function getLocalVideoHttpUrl(filePath: string) {
  const port = await window.electronAPI.getVideoServerPort();
  return `http://127.0.0.1:${port}/video?path=${encodeURIComponent(filePath)}`;
}

export async function getArchiveVideoHttpUrl(archivePath: string, fileName: string) {
  const port = await window.electronAPI.getVideoServerPort();
  return `http://127.0.0.1:${port}/archive-video?archive=${encodeURIComponent(archivePath)}&file=${encodeURIComponent(fileName)}`;
}
