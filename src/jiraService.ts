import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface JiraIssue {
    key: string;
    summary: string;
    status: string;
    assignee: string;
    assigneeEmail?: string;
    issueType?: string;
    priority?: string;
}

interface JiraApiIssue {
    key: string;
    fields: {
        summary: string;
        status: {
            name: string;
        };
        assignee: {
            displayName: string;
            emailAddress?: string;
            name?: string;
            key?: string;
            accountId?: string;
        } | null;
        issuetype: {
            name: string;
        };
        priority: {
            name: string;
        } | null;
    };
}

interface JiraSprintResponse {
    issues: JiraApiIssue[];
}

const constructAuthHeader = (email: string, token: string): string => {
    try {
        // Check if token is already base64 encoded
        const decodedToken = Buffer.from(token, 'base64').toString();
        if (decodedToken.includes(':')) {
            // Token is already in email:token format and base64 encoded
            return `Basic ${token}`;
        }
    } catch (e) {
        // Token is not base64 encoded, which is fine
    }

    // Construct auth string with email and raw token
    const authString = `${email}:${token}`;
    return `Basic ${Buffer.from(authString).toString('base64')}`;
};

// Jira API configuration
const config = {
    PORT: process.env.PORT || '3000',
    AUTH_HEADER: process.env.JIRA_USERNAME && process.env.JIRA_PASSWORD 
        ? constructAuthHeader(process.env.JIRA_USERNAME, process.env.JIRA_PASSWORD)
        : undefined,
    JIRA_HOST: process.env.JIRA_HOST || 'https://jira.corp.adobe.com',
    API_BASE_URL: process.env.JIRA_BASE_URL || 'https://jira.corp.adobe.com/rest/api/2',
    AGILE_BASE_URL: process.env.JIRA_AGILE_BASE_URL || 'https://jira.corp.adobe.com/rest/agile/1.0'
};

// Create Jira API instance for regular API
const jiraApi: AxiosInstance = axios.create({
    baseURL: config.API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': config.AUTH_HEADER
    },
});

// Create Jira Agile API instance for boards and sprints
const jiraAgileApi: AxiosInstance = axios.create({
    baseURL: config.AGILE_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': config.AUTH_HEADER
    },
});

class JiraService {
    private api: AxiosInstance;
    private agileApi: AxiosInstance;

    constructor() {
        if (!config.AUTH_HEADER) {
            throw new Error('Jira authentication not configured. Please set JIRA_USERNAME and JIRA_PASSWORD environment variables.');
        }
        this.api = jiraApi;
        this.agileApi = jiraAgileApi;
    }

    /**
     * Get issues from active sprint for a specific board
     */
    async getActiveSprintIssues(rapidViewId: string): Promise<JiraIssue[]> {
        try {
            console.log(`🔍 Fetching active sprint issues for board ${rapidViewId}...`);

            // First, get the active sprint for this board
            const sprintsResponse = await this.agileApi.get(`/board/${rapidViewId}/sprint`, {
                params: {
                    state: 'active'
                }
            });

            const activeSprints = sprintsResponse.data.values;
            if (!activeSprints || activeSprints.length === 0) {
                console.log('⚠️ No active sprints found for this board');
                return [];
            }

            const activeSprintId = activeSprints[0].id;
            console.log(`📋 Found active sprint: ${activeSprints[0].name} (ID: ${activeSprintId})`);

            // Get issues from the active sprint
            const issuesResponse = await this.agileApi.get(`/sprint/${activeSprintId}/issue`, {
                params: {
                    maxResults: 100,
                    fields: 'key,summary,status,assignee,issuetype,priority'
                }
            });

            const issues: JiraApiIssue[] = issuesResponse.data.issues || [];
            console.log(`✅ Found ${issues.length} issues in active sprint`);

            // Transform to our format
            const transformedIssues: JiraIssue[] = issues.map(issue => ({
                key: issue.key,
                summary: issue.fields.summary,
                status: issue.fields.status.name,
                assignee: issue.fields.assignee?.displayName || 'Unassigned',
                assigneeEmail: issue.fields.assignee?.emailAddress || issue.fields.assignee?.name || undefined,
                issueType: issue.fields.issuetype.name,
                priority: issue.fields.priority?.name || 'Medium'
            }));

            return transformedIssues;

        } catch (error) {
            console.error('❌ Error fetching active sprint issues:', error);
            if (axios.isAxiosError(error)) {
                console.error(`HTTP Status: ${error.response?.status}`);
                console.error(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);
            }
            throw error;
        }
    }

    /**
     * Get all issues from a specific board (not just active sprint)
     */
    async getBoardIssues(rapidViewId: string): Promise<JiraIssue[]> {
        try {
            console.log(`🔍 Fetching all issues for board ${rapidViewId}...`);

            const response = await this.agileApi.get(`/board/${rapidViewId}/issue`, {
                params: {
                    maxResults: 100,
                    fields: 'key,summary,status,assignee,issuetype,priority'
                }
            });

            const issues: JiraApiIssue[] = response.data.issues || [];
            console.log(`✅ Found ${issues.length} issues on board`);

            // Transform to our format
            const transformedIssues: JiraIssue[] = issues.map(issue => ({
                key: issue.key,
                summary: issue.fields.summary,
                status: issue.fields.status.name,
                assignee: issue.fields.assignee?.displayName || 'Unassigned',
                assigneeEmail: issue.fields.assignee?.emailAddress || issue.fields.assignee?.name || undefined,
                issueType: issue.fields.issuetype.name,
                priority: issue.fields.priority?.name || 'Medium'
            }));

            return transformedIssues;

        } catch (error) {
            console.error('❌ Error fetching board issues:', error);
            if (axios.isAxiosError(error)) {
                console.error(`HTTP Status: ${error.response?.status}`);
                console.error(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);
            }
            throw error;
        }
    }

    /**
     * Test the Jira connection
     */
    async testConnection(): Promise<boolean> {
        try {
            console.log('🔧 Testing Jira API connection...');
            const response = await this.api.get('/myself');
            console.log(`✅ Connected to Jira as: ${response.data.displayName} (${response.data.emailAddress})`);
            return true;
        } catch (error) {
            console.error('❌ Jira connection test failed:', error);
            if (axios.isAxiosError(error)) {
                console.error(`HTTP Status: ${error.response?.status}`);
                console.error(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);
            }
            return false;
        }
    }

    /**
     * Get board information
     */
    async getBoardInfo(rapidViewId: string): Promise<any> {
        try {
            console.log(`🔍 Fetching board info for ${rapidViewId}...`);
            const response = await this.agileApi.get(`/board/${rapidViewId}`);
            console.log(`📋 Board: ${response.data.name}`);
            return response.data;
        } catch (error) {
            console.error('❌ Error fetching board info:', error);
            if (axios.isAxiosError(error)) {
                console.error(`HTTP Status: ${error.response?.status}`);
                console.error(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);
            }
            throw error;
        }
    }
}

export default JiraService;
export { JiraIssue }; 