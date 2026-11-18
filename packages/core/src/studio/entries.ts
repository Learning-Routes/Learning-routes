// The agent Worker's own HTTP entry points (Platform STEP 20). The web Worker passes exactly these
// on to it, as it does the assistant's WebSocket; everything else under /api stays the API's.
export const TUTOR_PATH = "/api/tutor/ask";
export const IMAGES_PATH = "/api/creator/images";
