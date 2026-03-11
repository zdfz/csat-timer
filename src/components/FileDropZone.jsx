import React, { useState } from 'react';
import { Upload } from 'lucide-react';

const FileDropZone = ({ onFileSelect, label = "Drop Excel File Here", accept = ".xlsx,.xls" }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            // Mimic the event structure expected by parent handlers
            onFileSelect({ target: { files: e.dataTransfer.files } });
        }
    };

    const handleInputChange = (e) => {
        onFileSelect(e);
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer relative
                ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-neutral-300 hover:bg-neutral-50'}
            `}
        >
            {/* The label covers the whole area to ensure clicks work anywhere within the zone if the user prefers clicking */}
            <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full inset-0">
                <Upload size={40} className={`mb-3 ${isDragging ? 'text-primary-600' : 'text-neutral-400'}`} />
                <span className={`text-lg font-medium ${isDragging ? 'text-primary-700' : 'text-neutral-700'}`}>
                    {isDragging ? 'Drop file now' : label}
                </span>
                <input
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={handleInputChange}
                />
            </label>
        </div>
    );
};

export default FileDropZone;
