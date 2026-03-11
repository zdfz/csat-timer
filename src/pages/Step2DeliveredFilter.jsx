import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Upload, FileText, Play, Download, ArrowRight, ArrowLeft, Filter, AlertCircle, Calendar } from 'lucide-react';
import { readExcel, writeExcel } from '../utils/excel';
import { getCleanFileName } from '../utils/fileName';
import ProgressBar from '../components/ProgressBar';
import FileDropZone from '../components/FileDropZone';

const BATCH_SIZE = 50;

const Step2DeliveredFilter = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [data, setData] = useState([]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
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
                setError('File missing "track_number" column. Please use output from Step 1.');
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
                const response = await axios.post('/.netlify/functions/filter-delivered-shipments', {
                    shipments: batch,
                    dateFrom: dateFrom || null,
                    dateTo: dateTo || null
                });

                const batchResults = response.data.results || [];
                const valid = batchResults.filter(r => r.filter_status === 'kept');

                setResults(prev => [...prev, ...valid]);
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
        writeExcel(results, `${cleanName} | STEP 2.xlsx`);
    };

    return (
        <div className="space-y-6">
            <div className="bg-secondary-50 p-4 rounded-lg border border-secondary-100 mb-6">
                <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                    <Filter size={20} />
                    Step 2: Filter Delivered Shipments
                </h3>
                <p className="text-secondary-700 text-sm mt-1">
                    Upload result from Step 1. Filter shipments delivered within a specific date range.
                </p>
            </div>

            <div className="flex gap-4 mb-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">From Date/Time</label>
                    <input
                        type="datetime-local"
                        className="w-full border border-neutral-300 rounded-lg p-2 focus:border-primary-500 focus:ring-primary-500"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">To Date/Time</label>
                    <input
                        type="datetime-local"
                        className="w-full border border-neutral-300 rounded-lg p-2 focus:border-primary-500 focus:ring-primary-500"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                    />
                </div>
            </div>



            {!file ? (
                <FileDropZone onFileSelect={handleFileUpload} label="Drop Step 1 Output File" />
            ) : (
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
                >
                    <Play size={18} />
                    {dateFrom && dateTo ? 'Filter Shipments' : 'Process All (No Filter)'}
                </button>
            )}

            {(processing || results.length > 0) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <ProgressBar
                        current={progress}
                        total={data.length}
                        label={processing ? "Checking shipment history..." : "Filtering Complete"}
                        color={processing ? 'primary' : 'secondary'}
                    />

                    <div className="bg-neutral-50 p-3 rounded border border-neutral-200 text-center">
                        <span className="text-neutral-500">Delivered in Range</span>
                        <p className="text-xl font-bold text-neutral-800">{results.length}</p>
                    </div>
                </div>
            )}

            <div className="flex gap-4 pt-4 border-t border-neutral-200">
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2.5 bg-white border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2"
                >
                    <ArrowLeft size={18} />
                    Back
                </button>

                {results.length > 0 && !processing && (
                    <button
                        onClick={handleDownload}
                        className="flex-1 py-2.5 bg-white border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2"
                    >
                        <Download size={18} />
                        Download Filtered
                    </button>
                )}

                <button
                    onClick={() => navigate('/step3')}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20
            ${results.length > 0 ? 'bg-primary-600 hover:bg-primary-700' : 'bg-neutral-300 cursor-not-allowed'}`}
                    disabled={results.length === 0 && !processing}
                >
                    Next Step
                    <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
};

export default Step2DeliveredFilter;
