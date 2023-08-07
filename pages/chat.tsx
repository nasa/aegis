import { NextPage } from "next";
import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "typings/socketio";

const Chat: NextPage = () => {
  // State to store the messages
  const [messages, setMessages] = useState([]);
  // State to store the current message
  const [currentMessage, setCurrentMessage] = useState("");
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>();

  useEffect(() => {
    // Create a socket connection
    socket.current = io(process.env.BASE_URL, {
      transports: ["websocket"],
      path: "/api/socketio",
    });

    // Listen for incoming messages
    socket.current.on("message", (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    // Clean up the socket connection on unmount
    return () => {
      socket.current.disconnect();
    };
  }, []);

  const sendMessage = () => {
    // Send the message to the server
    socket.current.emit("message", currentMessage);
    // Clear the currentMessage state
    setCurrentMessage("");
  };

  return (
    <div>
      {/* Display the messages */}
      {messages.map((message, index) => (
        <p key={index}>{message}</p>
      ))}

      {/* Input field for sending new messages */}
      <input
        type="text"
        value={currentMessage}
        onChange={(e) => setCurrentMessage(e.target.value)}
      />

      {/* Button to submit the new message */}
      <button onClick={sendMessage}>Send</button>
    </div>
  );
};

export default Chat;
