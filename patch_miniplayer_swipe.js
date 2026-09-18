function initMiniplayerSwipeUpGesture() {
  const miniplayer = $('#miniplayer');
  if (!miniplayer) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let hasTriggered = false;

  const onTouchStart = (e) => {
    // ONLY PROCESS IF MINIPLAYER IS VISIBLE AND NOWPLAYING IS NOT OPEN
    if (miniplayer.classList.contains('hidden') || document.body.classList.contains('np-open')) return;
    
    // IGNORE CLICKS ON BUTTONS/INTERACTIVE ELEMENTS TO NOT BREAK PLAY/PAUSE/NEXT
    const target = e.target;
    if (target.closest('button') || target.closest('input')) return;

    const touch = e.touches ? e.touches[0] : e;
    startY = touch.clientY;
    currentY = startY;
    isDragging = true;
    hasTriggered = false;
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    currentY = touch.clientY;
    const deltaY = currentY - startY;

    // IF SWIPED UP BY MORE THAN 30PX
    if (deltaY < -30 && !hasTriggered) {
      hasTriggered = true;
      openNowPlaying();
      isDragging = false;
    }
  };

  const onTouchEnd = () => {
    isDragging = false;
  };

  miniplayer.addEventListener('touchstart', onTouchStart, { passive: true });
  miniplayer.addEventListener('touchmove', onTouchMove, { passive: true });
  miniplayer.addEventListener('touchend', onTouchEnd);
  miniplayer.addEventListener('touchcancel', onTouchEnd);
}
