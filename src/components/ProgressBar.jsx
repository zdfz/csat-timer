import React from 'react';

const ProgressBar = ({ current, total, label, color = 'blue' }) => {
    const percentage = total > 0 ? Math.min(100, (current / total) * 100) : 0;

    const colors = {
        blue: 'bg-blue-600',
        indigo: 'bg-indigo-600', // Primary
        green: 'bg-green-600',
        teal: 'bg-teal-500', // Success
        yellow: 'bg-amber-500'
    };

    return (
        <div className="w-full my-4">
            <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                <span>{label}</span>
                <span>{percentage.toFixed(1)}% ({current}/{total})</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                    className={`h-2.5 rounded-full transition-all duration-300 ${colors[color] || colors.blue}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

export default ProgressBar;
