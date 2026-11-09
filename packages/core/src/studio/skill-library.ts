import { parseSkill } from "./skills";
import { SKILL_FILES } from "./skills.gen";

// The skills the assistant ships with, read once when the Worker starts (Platform STEP 10 §3).
export const SKILLS = SKILL_FILES.map(parseSkill);
