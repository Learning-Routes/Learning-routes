import { newBlockId } from "@learning-routes/core/ids";

/** A new uuidv7 from the time and 10 random bytes: ids sort by creation. */
export const newId = () => newBlockId(Date.now(), crypto.getRandomValues(new Uint8Array(10)));
