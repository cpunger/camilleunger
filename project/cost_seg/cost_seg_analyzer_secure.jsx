// cost_seg_analyzer_secure.jsx

import React from 'react';
import axios from 'axios';

const CostSegAnalyzerSecure = () => {
    const [data, setData] = React.useState(null);

    const fetchData = async () => {
        try {
            const response = await axios.post('/api/anthropic-proxy', {
                // Your payload here
            });
            setData(response.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    React.useEffect(() => {
        fetchData();
    }, []);

    return (
        <div>
            <h1>Cost Segmentation Analyzer</h1>
            {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : <p>Loading...</p>}
        </div>
    );
};

export default CostSegAnalyzerSecure;