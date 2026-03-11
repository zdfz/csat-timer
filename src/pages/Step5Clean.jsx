import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Upload, FileText, Play, Download, ArrowLeft, Trash2, Settings, AlertCircle } from 'lucide-react';
import { readExcel, writeExcel, findColumnCaseInsensitive } from '../utils/excel';
import { getCleanFileName } from '../utils/fileName';
import FileDropZone from '../components/FileDropZone';

const Step5Clean = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [data, setData] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState([]);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);

    // Options
    const [action, setAction] = useState('dedup'); // Fixed to dedup
    const [params, setParams] = useState({
        marginDays: 1,
        deliveryCol: '',
        submittedCol: '',
        trackingCol: '',
        keep: 'random' // Default to random as requested
    });

    const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;

        try {
            const parsedData = await readExcel(uploadedFile);
            if (parsedData.length === 0) throw new Error('File is empty');
            setFile(uploadedFile);
            setData(parsedData);

            // Auto-populate columns
            const cols = parsedData[0] || {};
            const delCol = findColumnCaseInsensitive(cols, ['delivery_date', 'delivery date', 'delivered_time_riyadh']);
            const subCol = findColumnCaseInsensitive(cols, ['submitted', 'submitted_at', 'response date']);
            const trackCol = findColumnCaseInsensitive(cols, ['track_number', 'tracking_number', 'tracking number', 'track number', 'trackingnumber', 'awb', 'awb_number']);

            setParams(prev => ({
                ...prev,
                deliveryCol: delCol || '',
                submittedCol: subCol || '',
                trackingCol: trackCol || ''
            }));

        } catch (err) {
            setError('Failed to read file: ' + err.message);
        }
    };

    const startProcessing = async () => {
        if (!data.length) return;
        setProcessing(true);
        setError(null);
        setResults([]);
        setStats(null);

        try {
            const response = await axios.post('/.netlify/functions/clean-data', {
                data,
                action: 'dedup', // Force dedup
                params
            });

            if (response.data.results) {
                setResults(response.data.results);
                setStats(response.data.stats);
            }
        } catch (err) {
            console.error("Clean error", err);
            setError(`Processing failed: ${err.message}`);
        }

        setProcessing(false);
    };

    const handleDownload = () => {
        if (!file) return;
        const cleanName = getCleanFileName(file.name);
        writeExcel(results, `${cleanName} | CLEANED.xlsx`);
    };

    return (
        <div className="space-y-6">
            <div className="bg-primary-50 p-4 rounded-lg border border-primary-100 mb-6">
                <h3 className="font-semibold text-primary-900 flex items-center gap-2">
                    <Trash2 size={20} />
                    Step 5: Clean & Deduplicate
                </h3>
                <p className="text-primary-700 text-sm mt-1">
                    Final polish: remove duplicate responses to ensure unique entries.
                </p>
            </div>



            {!file ? (
                <FileDropZone onFileSelect={handleFileUpload} label="Drop Step 4 File" />
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

                    <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-neutral-900 flex items-center gap-2">
                            <Settings size={18} />
                            Configuration
                        </h4>

                        <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-200 mt-2">
                            <div className="w-full">
                                <label className="text-xs font-semibold text-neutral-500">Deduplicate By:</label>
                                <p className="mt-1 text-sm text-primary-700 bg-primary-50 px-2 py-1 rounded font-medium">
                                    {params.trackingCol || <span className="text-red-500">⚠ track_number column not detected — check file headers</span>}
                                </p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-2 text-sm">
                            <AlertCircle size={16} className="mt-0.5" />
                            <div className="whitespace-pre-line">{error}</div>
                        </div>
                    )}

                    {!processing && results.length === 0 && (
                        <button
                            onClick={startProcessing}
                            className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white transition-colors shadow-lg shadow-primary-500/20"
                        >
                            <Play size={18} />
                            Clean & Deduplicate
                        </button>
                    )}

                    {processing && (
                        <div className="text-center py-8">
                            <Settings className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-2" />
                            <p className="text-neutral-600">Processing...</p>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            {stats && (
                                <div className="bg-primary-50 p-3 rounded border border-primary-100 text-center text-primary-800">
                                    <p className="font-bold">Success!</p>
                                    <p className="text-sm">Removed: {stats.removed}, Final: {stats.finalRows} rows</p>
                                </div>
                            )}
                            <div className="flex gap-4 pt-4 border-t border-neutral-200">
                                <button
                                    onClick={() => navigate('/step4')}
                                    className="px-6 py-2.5 bg-white border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2"
                                >
                                    <ArrowLeft size={18} />
                                    Back
                                </button>

                                <button
                                    onClick={handleDownload}
                                    className="flex-1 py-2.5 bg-primary-600 rounded-lg font-medium text-white hover:bg-primary-700 flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
                                >
                                    <Download size={18} />
                                    Download Cleaned File
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Step5Clean;
