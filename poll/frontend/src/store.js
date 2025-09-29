import { configureStore, createSlice } from "@reduxjs/toolkit";

const pollSlice = createSlice({
  name: "poll",
  initialState: { question: "", options: [], votes: [], responses: [], correctIndex: null, ended: false },
  reducers: {
    updatePoll: (state, action) => ({ ...action.payload, ended: false }),
    endPoll: (state) => ({ ...state, ended: true }),
  },
});

export const { updatePoll, endPoll } = pollSlice.actions;

export const store = configureStore({
  reducer: { poll: pollSlice.reducer },
});
