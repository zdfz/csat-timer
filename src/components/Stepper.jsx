import React from 'react';
import { Check, Circle } from 'lucide-react';

const Stepper = ({ steps, currentStep }) => {
    return (
        <div className="w-full py-4">
            <div className="flex items-center justify-between relative">
                <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 -z-10" />
                {steps.map((step, index) => {
                    const isCompleted = index + 1 < currentStep;
                    const isCurrent = index + 1 === currentStep;

                    return (
                        <div key={index} className="flex flex-col items-center bg-white px-2">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors duration-200
                  ${isCompleted ? 'bg-green-500 border-green-500 text-white' :
                                        isCurrent ? 'bg-blue-600 border-blue-600 text-white' :
                                            'bg-white border-gray-300 text-gray-400'}`}
                            >
                                {isCompleted ? <Check size={16} /> : <span>{index + 1}</span>}
                            </div>
                            <span className={`mt-2 text-xs font-medium ${isCurrent ? 'text-blue-600' : 'text-gray-500'}`}>
                                {step.title}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Stepper;
