import { createApp } from "./app";
import { emailSenderFor } from "./auth/email";

export default createApp({ emailSender: emailSenderFor });
