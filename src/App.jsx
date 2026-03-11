import React, { useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Smartphone,
    Filter,
    Truck,
    GitMerge,
    Sparkles,
    ChevronRight
} from 'lucide-react';
import Step1MobileEnrichment from './pages/Step1MobileEnrichment';
import Step2DeliveredFilter from './pages/Step2DeliveredFilter';
import Step3CourierEnrichment from './pages/Step3CourierEnrichment';
import Step4Merge from './pages/Step4Merge';
import Step5Clean from './pages/Step5Clean';
import logo from './assets/images/logo.png';

const steps = [
    { title: 'Mobile Enrichment', path: '/', icon: Smartphone },
    { title: 'Delivered Filter', path: '/step2', icon: Filter },
    { title: 'Courier Enrichment', path: '/step3', icon: Truck },
    { title: 'Merge Data', path: '/step4', icon: GitMerge },
    { title: 'Clean & Dedup', path: '/step5', icon: Sparkles },
];

function App() {
    const [currentStep, setCurrentStep] = useState(1);
    const [sharedData, setSharedData] = useState({}); // To share file data between steps if needed

    const location = useLocation();
    const navigate = useNavigate();
    const currentStepIndex = steps.findIndex(s => s.path === location.pathname);

    return (
        <div className="min-h-screen bg-neutral-50 flex font-sans text-neutral-900">
            {/* Sidebar Navigation */}
            <aside className="w-72 bg-white border-r border-neutral-200 fixed h-full z-10 hidden md:flex flex-col shadow-premium">
                <div className="p-8 border-b border-neutral-100 flex justify-center">
                    <img src={logo} alt="AnalyticsPro Logo" className="h-12 w-auto" />
                </div>

                <nav className="flex-1 overflow-y-auto p-6 space-y-2">
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        const isActive = currentStepIndex === index;
                        const isCompleted = currentStepIndex > index;

                        return (
                            <button
                                key={step.path}
                                onClick={() => navigate(step.path)}
                                // disabled={index > currentStepIndex + 1} // Limit forward navigation implies linear flow
                                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all duration-300 group
                                    ${isActive
                                        ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100/50'
                                        : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                                    }
                                    ${isCompleted ? 'text-primary-600' : ''}
                                `}
                            >
                                <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-white shadow-sm text-primary-600' : 'bg-neutral-100 text-neutral-400 group-hover:bg-white group-hover:text-neutral-600 group-hover:shadow-sm'}`}>
                                    <Icon size={20} />
                                </div>

                                <span className={`font-medium ${isActive ? 'translate-x-1' : ''} transition-transform`}>
                                    {step.title}
                                </span>

                                {isActive && (
                                    <ChevronRight size={16} className="ml-auto text-primary-400 animate-pulse" />
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Status section removed */}
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-72 flex flex-col min-h-screen relative overflow-hidden">
                {/* Mobile Header */}
                <header className="md:hidden bg-white border-b border-neutral-200 p-4 sticky top-0 z-20 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                        <img src={logo} alt="AnalyticsPro Logo" className="h-8 w-auto" />
                    </div>
                </header>

                <div className="flex-1 p-6 md:p-12 max-w-7xl mx-auto w-full">
                    {/* Breadcrumbs / Header */}
                    <div className="mb-10 animate-fade-in">
                        <div className="flex items-center gap-2 text-sm text-neutral-500 mb-2 font-medium">
                            <span>Workflow</span>
                            <ChevronRight size={14} />
                            <span className="text-primary-600">Step {currentStepIndex + 1} of 5</span>
                        </div>
                        <h2 className="font-display text-4xl font-bold text-neutral-900 tracking-tight">
                            {steps[currentStepIndex].title}
                        </h2>
                        <p className="text-neutral-500 mt-2 text-lg max-w-2xl">
                            Follow the recommended workflow to ensure high quality data processing.
                        </p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-premium border border-neutral-100 p-8 min-h-[500px] animate-slide-up relative overflow-hidden">

                        {/* Decorative background blob */}
                        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <div className="relative z-10">
                            <Routes>
                                <Route path="/" element={<Step1MobileEnrichment />} />
                                <Route path="/step2" element={<Step2DeliveredFilter />} />
                                <Route path="/step3" element={<Step3CourierEnrichment />} />
                                <Route path="/step4" element={<Step4Merge />} />
                                <Route path="/step5" element={<Step5Clean />} />
                            </Routes>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
