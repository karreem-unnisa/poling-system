import React, { useEffect, useState } from "react";
import { socket } from "./socket";
import { useDispatch, useSelector } from "react-redux";
import { updatePoll } from "./store";
import "./App.css"; // import your CSS

function App() {
  const dispatch = useDispatch();
  const poll = useSelector((state) => state.poll);

  const [role, setRole] = useState(null);
  const [name, setName] = useState("");
  const [students, setStudents] = useState([]);

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(null);
  const [duration, setDuration] = useState(30);

  const [selectedOption, setSelectedOption] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const [timeLeft, setTimeLeft] = useState(0);
  const [pollActive, setPollActive] = useState(false);
  const [pollEnded, setPollEnded] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [removed, setRemoved] = useState(false);
  const [showPollForm, setShowPollForm] = useState(false);
  const [viewAsStudent, setViewAsStudent] = useState(false);
  const [pastPolls, setPastPolls] = useState([]);

  // --- SOCKET EVENTS ---
  useEffect(() => {
    socket.on("pollStarted", (pollData) => {
      if (!role) return;
      dispatch(updatePoll(pollData));
      setPollActive(true);
      setPollEnded(false);
      setSubmitted(false);
      setWaiting(false);
      setShowPollForm(false);
      setSelectedOption(null);
      setTimeLeft(pollData.duration);
    });

    socket.on("pollUpdated", (pollData) => {
      if (!role) return;
      dispatch(updatePoll(pollData));
    });

    socket.on("pollEnded", (pollData) => {
      if (!role) return;
      dispatch(updatePoll(pollData));
      setPollActive(false);
      setPollEnded(true);
      setWaiting(true);
      setTimeLeft(0);
    });

    socket.on("usersList", (list) => setStudents(list));

    socket.on("removed", () => {
      setRemoved(true);
      alert("❌ You have been removed by the teacher.");
    });

    socket.on("pollHistory", (history) => setPastPolls(history));

    return () => {
      socket.off("pollStarted");
      socket.off("pollUpdated");
      socket.off("pollEnded");
      socket.off("usersList");
      socket.off("removed");
      socket.off("pollHistory");
    };
  }, [dispatch, role]);

  // --- TIMER ---
  useEffect(() => {
    if (!pollActive || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? clearInterval(interval) : t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [pollActive, timeLeft]);

  // --- REGISTER USER ---
  const registerUser = (selectedRole) => {
    setRole(selectedRole);
    const existingStudent = students.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (selectedRole === "student" && existingStudent) {
      alert("Student with this name already exists. Reconnecting...");
    }
    socket.emit("registerUser", { name, role: selectedRole });

    if (selectedRole === "teacher") socket.emit("getPollHistory");
  };

  // --- CREATE POLL ---
  const createPoll = () => {
    if (!question || options.length < 2)
      return alert("Add question & at least 2 options");
    socket.emit("createPoll", { question, options, correctIndex, duration });
    setQuestion("");
    setOptions(["", ""]);
    setCorrectIndex(null);
    setWaiting(true);
    setShowPollForm(false);
  };

  // --- STUDENT ACTIONS ---
  const selectChoice = (index) => {
    setSelectedOption(index);
    socket.emit("selectChoice", { studentId: socket.id, name, choice: index });
  };

  const submitVote = () => {
    socket.emit("submitVote", { studentId: socket.id });
    setSubmitted(true);
  };

  const manualEndPoll = () => {
    socket.emit("manualEndPoll");
  };

  if (removed)
    return (
      <div className="app-container">
        <h2>You have been removed</h2>
        <p>Close this tab.</p>
      </div>
    );

  // --- HELPER COMPONENT TO SHOW POLL OPTIONS ---
  const renderOptions = () =>
    poll.options.map((opt, i) => (
      <button
        key={i}
        className={`choice-btn ${selectedOption === i ? "selected" : ""} ${
          pollEnded && poll.correctIndex === i ? "correct" : ""
        }`}
        disabled={submitted || pollEnded}
        onClick={() => selectChoice(i)}
      >
        {opt}
      </button>
    ));

  const renderStats = () =>
    poll.stats && (
      <div className="stats">
        <h4>{pollActive ? "Live Results" : "Final Results"}</h4>
        {poll.options.map((opt, i) => (
          <p
            key={i}
            className={`option-stat ${
              pollEnded && poll.correctIndex === i ? "correct" : ""
            }`}
          >
            {opt}: {poll.stats.percentages[i]}%
          </p>
        ))}
      </div>
    );

  return (
    <div className="app-container">
      {/* Register */}
      {!role && (
        <>
          <div className="header">
            <h1>Enter Name</h1>
          </div>
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="role-cards">
            <div className="role-card" onClick={() => registerUser("teacher")}>
              <h3>Teacher</h3>
              <p>Manage polls and view students</p>
            </div>
            <div className="role-card" onClick={() => registerUser("student")}>
              <h3>Student</h3>
              <p>Join polls and submit answers</p>
            </div>
          </div>
        </>
      )}

      {/* Teacher View */}
      {role === "teacher" && (
        <div className="section">
          <div className="subheading">Students:</div>
          <div className="student-list">
            {students.length === 0 && (
              <p className="stats">No students joined yet.</p>
            )}
            {students.map((s) => (
              <div className="student-item" key={s.id}>
                {s.name}
                <button onClick={() => socket.emit("removeStudent", s.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            className="btn"
            onClick={() => setViewAsStudent(!viewAsStudent)}
          >
            {viewAsStudent ? "🔙 Hide Student Preview" : "👁 View as Student"}
          </button>

          {!viewAsStudent && (
            <>
              {/* Create Poll */}
              {(!pollActive && (waiting || showPollForm)) && (
                <div className="poll-form">
                  <div className="form-row">
                    <input
                      className="input-field"
                      placeholder="Question"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                    />
                  </div>
                  {options.map((opt, i) => (
                    <div className="option-row" key={i}>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOptions = [...options];
                          newOptions[i] = e.target.value;
                          setOptions(newOptions);
                        }}
                      />
                      <input
                        type="radio"
                        name="correct"
                        checked={correctIndex === i}
                        onChange={() => setCorrectIndex(i)}
                      />
                      Correct
                      <button
                        onClick={() => {
                          const newOptions = options.filter(
                            (_, idx) => idx !== i
                          );
                          setOptions(newOptions);
                          if (correctIndex === i) setCorrectIndex(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn"
                    onClick={() => setOptions([...options, ""])}
                  >
                    + Add Option
                  </button>
                  <div className="form-row">
                    <label>Timer (s):</label>
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                    />
                  </div>
                  <button className="btn" onClick={createPoll}>
                    Start Poll
                  </button>
                </div>
              )}

              {/* Poll Stats */}
              {(pollActive || pollEnded) && renderStats()}

              {!pollActive && waiting && !showPollForm && (
                <button className="btn" onClick={() => setShowPollForm(true)}>
                  ➕ Create New Poll
                </button>
              )}

              {/* Past Polls */}
              {pastPolls.length > 0 && (
                <div className="stats">
                  <h3>Past Polls</h3>
                  {pastPolls.map((p, idx) => (
                    <div key={idx} className="poll-display">
                      <h4>{p.question}</h4>
                      {p.options.map((opt, i) => (
                        <p
                          key={i}
                          className={`option-stat ${
                            p.correctIndex === i ? "correct" : ""
                          }`}
                        >
                          {opt}: {p.stats.percentages[i]}%
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Student Preview */}
          {viewAsStudent && poll?.options && (
            <div className="poll-display">
              <h4>👀 Student Preview</h4>
              {!pollActive && waiting && <p>⏳ Waiting for poll...</p>}
              {(pollActive || pollEnded) && (
                <>
                  <h2>{poll.question}</h2>
                  {pollActive && <p className="time-left">Time Left: {timeLeft}s</p>}
                  {renderOptions()}
                  {!submitted && pollActive && (
                    <button
                      className="btn"
                      disabled={selectedOption === null}
                      onClick={submitVote}
                    >
                      Submit
                    </button>
                  )}
                  {renderStats()}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Student View */}
      {role === "student" && poll?.options && (
        <div className="section">
          <div className="subheading">Students Joined:</div>
          {students.length === 0 && <p>Waiting for teacher...</p>}
          {students.map((s) => (
            <div key={s.id}>{s.name}</div>
          ))}

          {!pollActive && waiting && <h3>⏳ Waiting for poll...</h3>}

          {(pollActive || pollEnded) && (
            <div className="poll-display">
              <h2>{poll.question}</h2>
              {pollActive && <p className="time-left">Time Left: {timeLeft}s</p>}
              {renderOptions()}
              {!submitted && pollActive && (
                <button
                  className="btn"
                  disabled={selectedOption === null}
                  onClick={submitVote}
                >
                  Submit
                </button>
              )}
              {renderStats()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
