import React, { useState } from "react";
import { Upload, Button, message } from "antd";
import { UploadOutlined } from "@ant-design/icons";

export default function UploadForm({ onSubmit }) {
  const [fileList, setFileList] = useState([]);

  const props = {
    accept: "image/*",
    multiple: false,
    beforeUpload: (f) => {
      setFileList([f]);
      return false;
    },
    onRemove: () => { setFileList([]); },
    fileList,
  };

  return (
    <>
      <Upload {...props}>
        <Button icon={<UploadOutlined />}>Select Image</Button>
      </Upload>
      <Button
        type="primary"
        disabled={!fileList.length}
        onClick={() => onSubmit(fileList[0])}
        style={{ marginLeft: 16 }}
      >
        Run Detection
      </Button>
    </>
  );
}
