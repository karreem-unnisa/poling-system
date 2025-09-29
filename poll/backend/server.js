import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

let users = []; // {id, name, role}
let currentPoll = null;
let pollEndTimeout = null;
let pastPolls = []; // store past polls

// --- Helpers ---
const findStudentByName = (name) =>
  users.find(u => u.role === "student" && u.name.toLowerCase() === name.toLowerCase());

const getStudentIds = () => users.filter(u => u.role === "student").map(u => u.id);
const getTeacherIds = () => users.filter(u => u.role === "teacher").map(u => u.id);

const broadcastUsers = () => {
  const students = users.filter(u => u.role === "student");
  io.to(getTeacherIds()).emit("usersList", students);
  io.to(getStudentIds()).emit("usersList", students);
};

const calculateResults = (poll) => {
  const totalStudents = getStudentIds().length;
  const submittedResponses = poll.responses.filter(r => r.submitted);
  let correctCount = 0, wrongCount = 0;
  submittedResponses.forEach(r => {
    if (r.choice === poll.correctIndex) correctCount++;
    else wrongCount++;
  });
  const noResponseCount = totalStudents - submittedResponses.length;
  const percentages = poll.votes.map(v =>
    totalStudents > 0 ? Math.round((v / totalStudents) * 100) : 0
  );
  return { ...poll, stats: { correctCount, wrongCount, noResponseCount, percentages } };
};

const broadcastPoll = (poll) => {
  if (!poll) return;
  const elapsed = Math.floor((Date.now() - poll.startTime) / 1000);
  const remaining = Math.max(poll.duration - elapsed, 0);
  const pollWithTime = { ...calculateResults(poll), duration: remaining };
  io.to(getStudentIds()).emit("pollStarted", pollWithTime);
  io.to(getTeacherIds()).emit("pollStarted", pollWithTime);
};

const broadcastPollStats = () => {
  if (!currentPoll) return;
  const elapsed = Math.floor((Date.now() - currentPoll.startTime) / 1000);
  const remaining = Math.max(currentPoll.duration - elapsed, 0);
  const pollWithTime = { ...calculateResults(currentPoll), duration: remaining };
  io.to(getStudentIds()).emit("pollUpdated", pollWithTime);
  io.to(getTeacherIds()).emit("pollUpdated", pollWithTime);
};

const endPoll = () => {
  if (!currentPoll) return;
  if (pollEndTimeout) clearTimeout(pollEndTimeout);

  // Auto-submit unsubmitted votes
  currentPoll.responses.forEach(r => {
    if (!r.submitted && r.choice !== undefined) {
      r.submitted = true;
      currentPoll.votes[r.choice] += 1;
    }
  });

  // Broadcast results
  const results = calculateResults(currentPoll);
  io.to(getStudentIds()).emit("pollEnded", results);
  io.to(getTeacherIds()).emit("pollEnded", results);

  // Save to past polls
  pastPolls.push(results);

  currentPoll = null;
  pollEndTimeout = null;
};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // --- Register ---
  socket.on("registerUser", ({ name, role }) => {
    if (!name || !role) return;

    if (role === "student") {
      const existing = findStudentByName(name);
      if (existing) existing.id = socket.id;
      else users.push({ id: socket.id, name, role });

      // If poll is ongoing, send current poll
      if (currentPoll) {
        const elapsed = Math.floor((Date.now() - currentPoll.startTime) / 1000);
        const remaining = Math.max(currentPoll.duration - elapsed, 0);
        socket.emit("pollStarted", { ...currentPoll, duration: remaining });
      }
    } else if (role === "teacher") {
      users.push({ id: socket.id, name, role });
    }

    broadcastUsers();
  });

  // --- Create Poll ---
  socket.on("createPoll", (poll) => {
    if (currentPoll) return;
    if (pollEndTimeout) clearTimeout(pollEndTimeout);

    const startTime = Date.now();
    currentPoll = {
      ...poll,
      startTime,
      votes: Array(poll.options.length).fill(0),
      responses: [], // {studentId, name, choice, submitted}
    };

    broadcastPoll(currentPoll);

    if (poll.duration > 0)
      pollEndTimeout = setTimeout(() => endPoll(), poll.duration * 1000);
  });

  // --- Student Actions ---
  socket.on("selectChoice", ({ studentId, name, choice }) => {
    if (!currentPoll) return;
    let resp = currentPoll.responses.find(r => r.studentId === studentId);
    if (!resp) currentPoll.responses.push({ studentId, name, choice, submitted: false });
    else resp.choice = choice;
    broadcastPollStats();
  });

  socket.on("submitVote", ({ studentId }) => {
    if (!currentPoll) return;
    let resp = currentPoll.responses.find(r => r.studentId === studentId);
    if (resp && !resp.submitted) {
      resp.submitted = true;
      if (resp.choice !== undefined) currentPoll.votes[resp.choice] += 1;
    }
    broadcastPollStats();
  });

  // --- Manual End Poll ---
  socket.on("manualEndPoll", () => {
    if (currentPoll) endPoll();
  });

  // --- Send Poll History ---
  socket.on("getPollHistory", () => {
    io.to(socket.id).emit("pollHistory", pastPolls);
  });

  // --- Remove Student ---
  socket.on("removeStudent", (studentId) => {
    io.to(studentId).emit("removed");
    users = users.filter(u => u.id !== studentId);
    io.sockets.sockets.get(studentId)?.disconnect(true);
    broadcastUsers();
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    users = users.filter(u => u.id !== socket.id);
    broadcastUsers();
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
