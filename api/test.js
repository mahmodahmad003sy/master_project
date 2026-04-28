const https = require("https");
const fs = require("fs");

const filePath = "D:/Master/dedKho/test/CamScanner 05-25-2025 13.10_100.jpg";
const fileName = "CamScanner 05-25-2025 13.10_100.jpg";
const fileBuffer = fs.readFileSync(filePath);
const boundary = "----NodeFormBoundary7MA4YWxkTrZu0gW";

const head = Buffer.from(
  `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`,
);

const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([head, fileBuffer, tail]);

const req = https.request(
  "https://np22ll-35-231-49-49.ru.tuna.am/compare?save_to_disk=true",
  {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log("status:", res.statusCode);
      console.log(data);
    });
  },
);

req.on("error", console.error);
req.write(body);
req.end();
