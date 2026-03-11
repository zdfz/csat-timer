import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Upload, FileText, Play, Download, ArrowRight, ArrowLeft, Truck, AlertCircle } from 'lucide-react';
import { readExcel, writeExcel } from '../utils/excel';
import { getCleanFileName } from '../utils/fileName';
import ProgressBar from '../components/ProgressBar';
import FileDropZone from '../components/FileDropZone';

const BATCH_SIZE = 20;

const Step3CourierEnrichment = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [data, setData] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState([]);
    const [error, setError] = useState(null);

    const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;
        setFile(uploadedFile);
        setError(null);
        try {
            const parsedData = await readExcel(uploadedFile);
            if (parsedData.length === 0) throw new Error('File is empty');

            const hasTrack = parsedData[0] && ('track_number' in parsedData[0]);
            if (!hasTrack) {
                setError('File missing "track_number" column. Please use output from Step 2.');
            } else {
                setData(parsedData);
            }
        } catch (err) {
            setError('Failed to read Excel file: ' + err.message);
        }
    };

    const startProcessing = async () => {
        if (!data.length) return;
        setProcessing(true);
        setResults([]);
        setProgress(0);
        setError(null);

        const total = data.length;
        let processed = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = data.slice(i, i + BATCH_SIZE);

            try {
                const response = await axios.post('/.netlify/functions/process-couriers', {
                    shipments: batch
                });

                const batchResults = response.data.results || [];
                setResults(prev => [...prev, ...batchResults]);
                processed += batch.length;
                setProgress(Math.min(processed, total));

            } catch (err) {
                setError(prev => (prev ? prev + '\n' : '') + `Batch ${i} failed: ${err.message}`);
            }
        }
        setProcessing(false);
    };

    const handleDownload = () => {
        if (!file) return;
        const cleanName = getCleanFileName(file.name);
        writeExcel(results, `${cleanName} | STEP 3.xlsx`);
    };

    return (
        <div className="space-y-6">
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 mb-6">
                <h3 className="font-semibold text-purple-900 flex items-center gap-2">
                    <Truck size={20} />
                    Step 3: Courier & Hub Details
                </h3>
                <p className="text-primary-700 text-sm mt-1">
                    Upload result from Step 2. it will fetch courier names, codes, and hub details.
                </p>
            </div>



            {!file ? (
                <FileDropZone onFileSelect={handleFileUpload} label="Drop Step 2 Output File" />
            ) : (
                <div className="bg-white border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-lg text-green-700">
                            <FileText size={20} />
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">{file.name}</p>
                            <p className="text-sm text-gray-500">{data.length} rows loaded</p>
                        </div>
                    </div>
                    <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 text-sm">Remove</button>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-2 text-sm">
                    <AlertCircle size={16} className="mt-0.5" />
                    <div className="whitespace-pre-line">{error}</div>
                </div>
            )}

            {file && !processing && results.length === 0 && (
                <button
                    onClick={startProcessing}
                    className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                    <Play size={18} />
                    Fetch Courier Data
                </button>
            )}

            {(processing || results.length > 0) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <ProgressBar
                        current={progress}
                        total={data.length}
                        label={processing ? "Fetching courier info..." : "Processing Complete"}
                        color={processing ? 'blue' : 'green'}
                    />

                    <div className="bg-gray-50 p-3 rounded border text-center">
                        <span className="text-gray-500">Rows Processed</span>
                        <p className="text-xl font-bold text-gray-800">{results.length}</p>
                    </div>
                </div>
            )}

            <div className="flex gap-4 pt-4 border-t">
                <button
                    onClick={() => navigate('/step2')}
                    className="px-6 py-2.5 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                    <ArrowLeft size={18} />
                    Back
                </button>

                {results.length > 0 && !processing && (
                    <button
                        onClick={handleDownload}
                        className="flex-1 py-2.5 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                    >
                        <Download size={18} />
                        Download Enriched
                    </button>
                )}

                <button
                    onClick={() => navigate('/step4')}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2
            ${results.length > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
                    disabled={results.length === 0 && !processing}
                >
                    Next Step
                    <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
};

export default Step3CourierEnrichment;
