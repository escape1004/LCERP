export async function exitPictureInPicture() {
  const pictureInPictureVideo = document.pictureInPictureElement;
  if (pictureInPictureVideo instanceof HTMLVideoElement) {
    pictureInPictureVideo.pause();
  }

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }
  } catch (error) {
    if (document.pictureInPictureElement) {
      console.error('PIP 종료 실패:', error);
    }
  }

  try {
    await window.electronAPI.setPictureInPictureActive(false);
  } catch (error) {
    console.error('PIP 오디오 상태 초기화 실패:', error);
  }
}
