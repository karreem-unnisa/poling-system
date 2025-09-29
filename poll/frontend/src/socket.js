
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL || "http://localhost:4000";
export const socket = io(BACKEND_URL);
