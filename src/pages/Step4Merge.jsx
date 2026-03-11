import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Upload, FileText, Play, Download, ArrowRight, ArrowLeft, GitMerge, AlertCircle, Settings } from 'lucide-react';
import { readExcel, writeExcel, findColumnCaseInsensitive } from '../utils/excel';
import { getCleanFileName } from '../utils/fileName';
import ProgressBar from '../components/ProgressBar';
import FileDropZone from '../components/FileDropZone';

const Step4Merge = () => {
    const navigate = useNavigate();
    const [mainFile, setMainFile] = useState(null);
    const [secFile, setSecFile] = useState(null);
    const [mainData, setMainData] = useState([]);
    const [secData, setSecData] = useState([]);

    const [mainCol, setMainCol] = useState('');
    const [secCol, setSecCol] = useState('');

    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState([]);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);

    const handleFileUpload = async (e, type) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;

        try {
            const parsedData = await readExcel(uploadedFile);
            if (parsedData.length === 0) throw new Error('File is empty');

            const candidates = ['mobile', 'phone', 'tel', 'cell', 'consignee phone', 'consignee_phone'];
            const foundCol = findColumnCaseInsensitive(parsedData[0], candidates);

            if (type === 'main') {
                setMainFile(uploadedFile);
                setMainData(parsedData);
                if (foundCol) setMainCol(foundCol);
            } else {
                setSecFile(uploadedFile);
                setSecData(parsedData);
                if (foundCol) setSecCol(foundCol);
            }
            setError(null);
        } catch (err) {
            setError(`Failed to read ${type} file: ` + err.message);
        }
    };

    const startProcessing = async () => {
        if (!mainData.length || !secData.length) return;
        setProcessing(true);
        setError(null);
        setResults([]);

        try {
            const payload = {
                mainData,
                secondaryData: secData,
                mainMobileCol: mainCol,
                secondaryMobileCol: secCol
            };

            const jsonSize = JSON.stringify(payload).length;
            if (jsonSize > 5 * 1024 * 1024) {
                console.warn("Payload likely too big for Netlify Function. Switching to Client-Side merge logic.");
            }

            const response = await axios.post('/.netlify/functions/merge-data', payload);

            if (response.data.results) {
                setResults(response.data.results);
                setStats(response.data.meta);
                console.log("Merge Meta Debug:", response.data.meta);
            }
        } catch (err) {
            console.error("Merge error", err);
            setError(`Merge failed (Server limit likely reached). Error: ${err.message}. Try reducing file size.`);
        }

        setProcessing(false);
    };

    const handleDownload = () => {
        if (!mainFile) return;
        const cleanName = getCleanFileName(mainFile.name);
        writeExcel(results, `${cleanName} | STEP 4.xlsx`);
    };

    return (
        <div className="space-y-6">
            <div className="bg-primary-50 p-4 rounded-lg border border-primary-100 mb-6">
                <h3 className="font-semibold text-primary-900 flex items-center gap-2">
                    <GitMerge size={20} />
                    Step 4: Merge Shipments with CSAT
                </h3>
                <p className="text-primary-700 text-sm mt-1">
                    Select your "Main" file (e.g. Step 3) and "Secondary" file (e.g. CSAT Responses from fluent). We'll link them by Mobile Number.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">


                {/* Main File */}
                <div className="space-y-2">
                    <h4 className="font-medium text-neutral-700">Main File (Shipments)</h4>
                    {!mainFile ? (
                        <FileDropZone onFileSelect={(e) => handleFileUpload(e, 'main')} label="Upload Main File" />
                    ) : (
                        <div className="bg-white border border-neutral-200 rounded-lg p-3">
                            <p className="font-medium text-neutral-900 truncate">{mainFile.name}</p>
                            <p className="text-xs text-neutral-500">{mainData.length} rows</p>
                            <div className="mt-2">
                                <label className="text-xs font-semibold text-neutral-500">Mobile Column:</label>
                                <select
                                    className="w-full mt-1 text-sm border-neutral-300 rounded shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    value={mainCol}
                                    onChange={(e) => setMainCol(e.target.value)}
                                >
                                    {Object.keys(mainData[0] || {}).map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Secondary File */}
                <div className="space-y-2">
                    <h4 className="font-medium text-neutral-700">Secondary File (CSAT)</h4>
                    {!secFile ? (
                        <FileDropZone onFileSelect={(e) => handleFileUpload(e, 'sec')} label="Upload CSAT File" />
                    ) : (
                        <div className="bg-white border border-neutral-200 rounded-lg p-3">
                            <p className="font-medium text-neutral-900 truncate">{secFile.name}</p>
                            <p className="text-xs text-neutral-500">{secData.length} rows</p>
                            <div className="mt-2">
                                <label className="text-xs font-semibold text-neutral-500">Mobile Column:</label>
                                <select
                                    className="w-full mt-1 text-sm border-neutral-300 rounded shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    value={secCol}
                                    onChange={(e) => setSecCol(e.target.value)}
                                >
                                    {Object.keys(secData[0] || {}).map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-2 text-sm">
                    <AlertCircle size={16} className="mt-0.5" />
                    <div className="whitespace-pre-line">{error}</div>
                </div>
            )}

            {mainFile && secFile && !processing && results.length === 0 && (
                <button
                    onClick={startProcessing}
                    className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white transition-colors shadow-lg shadow-primary-500/20"
                >
                    <Play size={18} />
                    Merge Files
                </button>
            )}

            {processing && (
                <div className="text-center py-8">
                    <Settings className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-2" />
                    <p className="text-neutral-600">Merging data... (This may take a moment)</p>
                </div>
            )}

            {results.length > 0 && !processing && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    {stats && (
                        <div className="grid grid-cols-3 gap-4 text-sm text-center">
                            <div className="bg-neutral-50 p-2 rounded text-neutral-700">Main: {stats.mainRows}</div>
                            <div className="bg-neutral-50 p-2 rounded text-neutral-700">Sec: {stats.secondaryRows}</div>
                            <div className="bg-primary-50 p-2 rounded text-primary-700 font-bold">Matches: {stats.matchCount}</div>
                        </div>
                    )}

                    <div className="flex gap-4 pt-4 border-t border-neutral-200">
                        <button
                            onClick={() => navigate('/step3')}
                            className="px-6 py-2.5 bg-white border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft size={18} />
                            Back
                        </button>

                        <button
                            onClick={handleDownload}
                            className="flex-1 py-2.5 bg-white border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2"
                        >
                            <Download size={18} />
                            Download Merged
                        </button>

                        <button
                            onClick={() => navigate('/step5')}
                            className="flex-1 py-2.5 bg-primary-600 rounded-lg font-medium text-white hover:bg-primary-700 flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
                        >
                            Next Step
                            <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Step4Merge;
