import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Upload, FileText, Play, Download, ArrowRight, AlertCircle, Loader } from 'lucide-react';
import { readExcel, writeExcel, findColumnCaseInsensitive } from '../utils/excel';
import { getCleanFileName } from '../utils/fileName';
import ProgressBar from '../components/ProgressBar';
import FileDropZone from '../components/FileDropZone';

const BATCH_SIZE = 5;

const Step1MobileEnrichment = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [data, setData] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState([]);
    const [error, setError] = useState(null);
    const [mobileCol, setMobileCol] = useState('');
    const [estimatedTime, setEstimatedTime] = useState(null);

    const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;
        setFile(uploadedFile);
        setError(null);
        setResults([]);
        setMobileCol('');

        try {
            const parsedData = await readExcel(uploadedFile);
            if (parsedData.length === 0) throw new Error('File is empty');

            // Auto-detect mobile column
            const candidates = ['mobile', 'phone', 'tel', 'cell', 'consignee phone', 'consignee_phone'];
            const found = findColumnCaseInsensitive(parsedData[0], candidates);

            if (!found) {
                // If not found, we can't really proceed automatically.
                // But the user said "it should automaticly find it".
                // If it fails, we should probably error out.
                throw new Error('Could not find a mobile number column (e.g., mobile, phone, tel). Please rename your column.');
            }

            setMobileCol(found);

            // Filter out rows where the mobile column is empty
            const filteredData = parsedData.filter(row => {
                const val = row[found];
                return val !== undefined && val !== null && String(val).trim() !== '';
            });

            if (filteredData.length === 0) {
                throw new Error('No rows with valid mobile numbers found.');
            }

            setData(filteredData);

        } catch (err) {
            setError(err.message);
            // Reset state on error
            setFile(null);
            setData([]);
        }
    };

    const startProcessing = async () => {
        if (!data.length || !mobileCol) {
            setError('Please select the mobile number column');
            return;
        }

        setProcessing(true);
        setResults([]);
        setProgress(0);
        setError(null);
        setEstimatedTime('Calculating...');

        const total = data.length;
        let processedCount = 0;
        const startTime = Date.now();

        // CONFIGURATION: Smart Queue
        const BATCH_SIZE_Q = 3;
        const CONCURRENCY = 2;

        // Create tasks queue
        const queue = [];
        for (let i = 0; i < total; i += BATCH_SIZE_Q) {
            queue.push({
                batch: data.slice(i, i + BATCH_SIZE_Q),
                startIndex: i
            });
        }

        // Worker Function
        const worker = async (workerId) => {
            while (queue.length > 0) {
                const task = queue.shift();
                if (!task) break;

                const { batch, startIndex } = task;

                const mobileNumbers = batch.map((row, index) => ({
                    mobile: row[mobileCol],
                    rowIndex: startIndex + index
                }));

                try {
                    const response = await axios.post('/.netlify/functions/process-mobile-data', {
                        mobileNumbers
                    });

                    const batchResults = response.data.results || [];

                    setResults(prev => [...prev, ...batchResults]);

                    processedCount += batch.length;
                    const currentProcessed = Math.min(processedCount, total);
                    setProgress(currentProcessed);

                    // Calculate Estimated Time Remaining
                    const elapsed = Date.now() - startTime;
                    const speed = currentProcessed / elapsed; // items per ms
                    const remainingItems = total - currentProcessed;
                    const remainingMs = remainingItems / speed;

                    // Update estimated time every few items to avoid flicker
                    if (currentProcessed % 5 === 0 || remainingItems === 0) {
                        if (remainingMs > 60000) {
                            setEstimatedTime(`${Math.ceil(remainingMs / 60000)} mins remaining`);
                        } else {
                            setEstimatedTime(`${Math.ceil(remainingMs / 1000)} secs remaining`);
                        }
                    }

                } catch (err) {
                    console.error(`Worker ${workerId} error`, err);
                    setError(prev => (prev ? prev + '\n' : '') + `Batch starting at row ${startIndex + 1} failed: ${err.message}`);
                }
            }
        };

        // Start Workers
        const workers = Array(CONCURRENCY).fill(null).map((_, i) => worker(i));
        await Promise.all(workers);

        setProcessing(false);
        setEstimatedTime(null);
    };

    const handleDownload = () => {
        if (!file) return;
        const cleanName = getCleanFileName(file.name);
        writeExcel(results, `${cleanName} | STEP 1.xlsx`);
    };



    return (
        <div className="space-y-6">
            <div className="bg-primary-50 p-4 rounded-lg border border-primary-100 mb-6">
                <h3 className="font-semibold text-primary-900 flex items-center gap-2">
                    <Loader size={20} />
                    Step 1: Mobile Enrichment
                </h3>
                <p className="text-primary-700 text-sm mt-1">
                    Upload your raw shipment file (Fluent).
                </p>
            </div>

            {!file ? (
                <FileDropZone onFileSelect={handleFileUpload} />
            ) : (
                <div className="space-y-4">
                    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-primary-100 p-2 rounded-lg text-primary-700">
                                <FileText size={20} />
                            </div>
                            <div>
                                <p className="font-medium text-neutral-900">{file.name}</p>
                                <p className="text-sm text-neutral-500">{data.length} rows loaded</p>
                            </div>
                        </div>
                        <button onClick={() => setFile(null)} className="text-neutral-400 hover:text-red-500 text-sm">Remove</button>
                    </div>

                    <div className="bg-white border border-neutral-200 rounded-lg p-4">
                        <p className="text-sm text-neutral-700">
                            <strong>Auto-detected Mobile Column:</strong> <span className="text-primary-600 font-mono bg-primary-50 px-2 py-0.5 rounded">{mobileCol}</span>
                        </p>
                    </div>
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
                    className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white transition-colors shadow-lg shadow-primary-500/20"
                    disabled={!mobileCol}
                >
                    <Play size={18} />
                    Process Mobile Numbers
                </button>
            )}

            {(processing || results.length > 0) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <ProgressBar
                        current={progress}
                        total={data.length}
                        label={processing ? (estimatedTime ? `Standardizing numbers... (${estimatedTime})` : "Standardizing numbers...") : "Processing Complete"}
                        color={processing ? 'primary' : 'secondary'}
                    />

                    <div className="flex gap-4 pt-4 border-t border-neutral-200">
                        <button
                            onClick={handleDownload}
                            className="flex-1 py-2.5 bg-white border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2"
                        >
                            <Download size={18} />
                            Download Enriched
                        </button>

                        <button
                            onClick={() => navigate('/step2')}
                            className="btn-primary flex-1 flex items-center justify-center gap-2 group bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg font-medium shadow-lg shadow-primary-500/20"
                        >
                            Next Step
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Step1MobileEnrichment;
