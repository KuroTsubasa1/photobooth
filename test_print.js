const io = require("socket.io-client");
const socket = io("http://localhost:3001");

socket.on("connect", () => {
  console.log("Connected to photobooth server");
  
  // Test print with existing image
  socket.emit("print-photo", { path: "/tmp/test_print.jpg" });
});

socket.on("print-started", () => {
  console.log("Print started");
});

socket.on("print-complete", (data) => {
  console.log("Print completed:", data);
  process.exit(0);
});

socket.on("print-error", (error) => {
  console.error("Print error:", error);
  process.exit(1);
});

socket.on("print-status", (status) => {
  console.log("Print status:", status);
});
