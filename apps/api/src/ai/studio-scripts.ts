import budgetOut from "../../test/fixtures/studio-scripts/budget-out.json" with { type: "json" };
import fractions from "../../test/fixtures/studio-scripts/from-zero-fractions.json" with {
  type: "json",
};
import hostileUpload from "../../test/fixtures/studio-scripts/hostile-upload.json" with {
  type: "json",
};
import streamFails from "../../test/fixtures/studio-scripts/stream-fails.json" with {
  type: "json",
};
import streamFails402 from "../../test/fixtures/studio-scripts/stream-fails-402.json" with {
  type: "json",
};

// The scripts the scripted provider plays (STEP 11-prep §A1), as committed under test/fixtures. They
// are bundled with the agent Worker but read only when MODEL_PROVIDER is "scripted", never in production.
export const STUDIO_SCRIPT_FILES: unknown[] = [
  fractions,
  budgetOut,
  streamFails,
  streamFails402,
  hostileUpload,
];
