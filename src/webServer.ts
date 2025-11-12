import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import cron from 'node-cron';
import JiraService, { JiraIssue } from './jiraService.js';
import WeeklyReminderService from './weeklyReminderService.js';
import EmailActivityLogger from './emailActivityLogger.js';

// Load environment variables
dotenv.config({ override: true });

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration interfaces to match frontend structure
interface JiraBoard {
    id: string;
    name: string;
    rapidViewId: string;
    boardName: string;
    boardType: string;
    issueCount: number;
    validated: boolean;
    addedAt: string;
}

interface ScheduledTask {
    id: string;
    type: 'status' | 'reminder';
    frequency: 'daily' | 'weekly';
    time: string;
    dayOfWeek?: number; // 0-6 (Sunday-Saturday) for weekly tasks
    enabled: boolean;
    rapidViewId: string;
    createdAt: string;
}

interface AppConfig {
    savedJiraIds: JiraBoard[];
    scheduledTasks: ScheduledTask[];
    globalSettings: {
        defaultReminderTime: string;
    };
}

// Default configuration
const defaultConfig: AppConfig = {
    savedJiraIds: [],
    scheduledTasks: [],
    globalSettings: {
        defaultReminderTime: '09:00'
    }
};

const CONFIG_FILE = path.resolve(process.cwd(), 'app-config.json');

class WebServer {
    private app: express.Application;
    private jiraService: JiraService;
    private weeklyReminderService: WeeklyReminderService;
    private activityLogger: EmailActivityLogger;
    private config: AppConfig;
    private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

    constructor() {
        this.app = express();
        this.jiraService = new JiraService();
        this.weeklyReminderService = new WeeklyReminderService();
        this.activityLogger = new EmailActivityLogger();
        this.config = this.loadConfig();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.scheduleReminders();
    }

    private loadConfig(): AppConfig {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
                return JSON.parse(configData);
            }
        } catch (error) {
            console.warn('⚠️ Could not load config file, using defaults:', error);
        }
        return defaultConfig;
    }

    private saveConfig(): void {
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('❌ Error saving config:', error);
        }
    }

    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    private setupRoutes(): void {
        // Serve the frontend
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // API Routes
        this.app.get('/api/config', (req, res) => {
            res.json(this.config);
        });

        this.app.post('/api/config', (req, res) => {
            try {
                this.config = req.body;
                this.saveConfig();
                this.scheduleReminders(); // Reschedule with new config
                res.json({ success: true, message: 'Configuration updated successfully' });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
            }
        });

        // Test JIRA connection
        this.app.get('/api/test-jira', async (req, res) => {
            try {
                const isConnected = await this.jiraService.testConnection();
                res.json({ success: isConnected, connected: isConnected });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Connection failed' });
            }
        });

        // Get board info
        this.app.get('/api/board/:rapidViewId', async (req, res) => {
            try {
                const { rapidViewId } = req.params;
                const boardInfo = await this.jiraService.getBoardInfo(rapidViewId);
                res.json({ success: true, data: boardInfo });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch board info' });
            }
        });

        // Get board issues
        this.app.get('/api/board/:rapidViewId/issues', async (req, res) => {
            try {
                const { rapidViewId } = req.params;
                const issues = await this.jiraService.getActiveSprintIssues(rapidViewId);
                res.json({ success: true, data: issues, count: issues.length });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch issues' });
            }
        });

        // Send immediate sprint update email
        this.app.post('/api/send-sprint-update/:rapidViewId', async (req, res) => {
            try {
                const { rapidViewId } = req.params;
                await this.sendSprintUpdate(rapidViewId);
                res.json({ success: true, message: 'Sprint update email sent successfully' });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to send email' });
            }
        });

        // Send immediate reminder (bypasses weekly state checks)
        this.app.post('/api/send-weekly-reminder', async (req, res) => {
            try {
                await this.weeklyReminderService.runScheduledReminders();
                res.json({ success: true, message: 'Reminder sent successfully' });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to send reminder' });
            }
        });

        // Get activity status
        this.app.get('/api/activity', (req, res) => {
            try {
                // Read activity data if available
                res.json({ success: true, message: 'Activity logging disabled for security' });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get activity' });
            }
        });

        // Note: Sprint configuration routes removed as we now use scheduledTasks
        // The frontend manages scheduled tasks directly through the main config endpoint
    }

    private async sendSprintUpdate(rapidViewId: string): Promise<void> {
        try {
            // Get issues using our existing service
            let issues = await this.jiraService.getActiveSprintIssues(rapidViewId);
            if (issues.length === 0) {
                console.log('📋 No active sprint found, fetching all board issues...');
                issues = await this.jiraService.getBoardIssues(rapidViewId);
            }
            
            if (issues.length === 0) {
                throw new Error('No issues found on the board');
            }
            
            // Filter out closed issues
            const closedStatuses = ['close', 'closed', 'done', 'resolved'];
            const openIssues = issues.filter(issue => 
                !closedStatuses.includes(issue.status.toLowerCase())
            );
            
            console.log(`📧 Sending sprint update for ${openIssues.length} open issues...`);
            
            // Use existing sprint update email logic from scrapeJiraBoard
            await this.sendEmailUsingExistingLogic(openIssues);
            
        } catch (error) {
            console.error('❌ Error in sendSprintUpdate:', error);
            throw error;
        }
    }

    private async sendEmailUsingExistingLogic(issues: JiraIssue[]): Promise<void> {
        const nodemailer = (await import('nodemailer')).default;
        
        try {
            // Create transporter using existing SMTP settings
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_SERVER,
                port: Number(process.env.SMTP_PORT),
                secure: process.env.USE_SSL === 'true',
                auth: {
                    user: process.env.smtp_username,
                    pass: process.env.EMAIL_PASSWORD
                },
                tls: {
                    rejectUnauthorized: false
                },
                connectionTimeout: 60000,
                greetingTimeout: 30000,
                socketTimeout: 60000
            });

            // Get recipients
            const recipients = [
                process.env.Doc_Email1,
                process.env.Doc_Email2,
                process.env.Doc_Email3
            ].filter((email): email is string => email !== undefined && email.trim() !== '');

            if (recipients.length === 0) {
                throw new Error('No valid email recipients found in environment variables');
            }

            const ccRecipient = process.env.CC_EMAIL?.trim();

            // Format summary
            const statusCount = issues.reduce((acc: Record<string, number>, issue) => {
                acc[issue.status] = (acc[issue.status] || 0) + 1;
                return acc;
            }, {});

            const summaryLines = [
                `Total issues: ${issues.length}`,
                'Issues by Status:'
            ];
            for (const [status, count] of Object.entries(statusCount)) {
                summaryLines.push(`${status}: ${count} issues`);
            }
            const summary = summaryLines.join('\n');

            // Email options
            const mailOptions = {
                from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
                to: recipients.join(','),
                cc: ccRecipient,
                subject: 'Sprint Update',
                text: `Sprint Update\n\nSummary\n${summary}\n\nBelow is the current status of all issues in the active sprint:\nActive Sprint Issues\n${issues.map(issue => `${issue.key}\t${issue.summary}\t${issue.assignee}\t${issue.status}`).join('\n')}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Sprint Update</title>
                    </head>
                    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
                        
                        <!-- Header -->
                        <div style="background: #0052cc; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: left;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 600;">Sprint Update</h1>
                        </div>
                        
                        <!-- Main Content Container -->
                        <div style="background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                            
                            <!-- Summary Section -->
                            <div style="padding: 30px; border-bottom: 1px solid #e1e5e9;">
                                <h2 style="color: #172b4d; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Summary</h2>
                                <div style="background-color: #f4f5f7; padding: 20px; border-radius: 6px; border-left: 4px solid #0052cc;">
                                    <pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; white-space: pre-wrap; color: #42526e; font-size: 14px; line-height: 1.5;">${summary}</pre>
                                </div>
                            </div>
                            
                            <!-- Issues Section -->
                            <div style="padding: 30px;">
                                <p style="margin: 0 0 20px 0; color: #42526e; font-size: 14px;">Below is the current status of all issues in the active sprint:</p>
                                
                                <h2 style="color: #0052cc; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Active Sprint Issues</h2>
                                
                                <!-- Issues Table -->
                                <div style="overflow-x: auto; border: 1px solid #dfe1e6; border-radius: 6px;">
                                    <table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">
                                        <thead>
                                            <tr style="background-color: #f4f5f7;">
                                                <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Issue</th>
                                                <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Title</th>
                                                <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Assignee</th>
                                                <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${issues.map((issue: JiraIssue, index: number) => `
                                                <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f9fafc'}; border-bottom: 1px solid #dfe1e6;">
                                                    <td style="border: 1px solid #dfe1e6; padding: 12px 16px;">
                                                        <a href="https://jira.corp.adobe.com/browse/${issue.key}" style="color: #0052cc; text-decoration: none; font-weight: 500; font-size: 14px;">${issue.key}</a>
                                                    </td>
                                                    <td style="border: 1px solid #dfe1e6; padding: 12px 16px; color: #172b4d; font-size: 14px; line-height: 1.4;">${issue.summary}</td>
                                                    <td style="border: 1px solid #dfe1e6; padding: 12px 16px; color: #42526e; font-size: 14px;">${issue.assignee}</td>
                                                    <td style="border: 1px solid #dfe1e6; padding: 12px 16px; color: #42526e; font-size: 14px;">
                                                        ${issue.status}
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            console.log('📤 Sending sprint update email...');
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Sprint update email sent successfully!');
            console.log(`📧 Message ID: ${info.messageId}`);
            
            // Log the activity
            this.activityLogger.logSprintUpdate(true, recipients, issues.length);
            
        } catch (error) {
            console.error('❌ Error sending sprint update email:', error);
            this.activityLogger.logSprintUpdate(false, [], 0, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    private scheduleReminders(): void {
        // Clear existing scheduled jobs
        this.scheduledJobs.forEach(job => job.stop());
        this.scheduledJobs.clear();

        // Process scheduledTasks from frontend
        const scheduledTasks = this.config.scheduledTasks || [];
        
        if (scheduledTasks.length === 0) {
            console.log('📅 No scheduled tasks found');
            return;
        }

        console.log(`📅 Processing ${scheduledTasks.length} scheduled task(s)...`);

        scheduledTasks.forEach((task: ScheduledTask) => {
            if (!task.enabled) {
                console.log(`⏸️ Skipping disabled task: ${task.type} (ID: ${task.id})`);
                return;
            }

            const [hour, minute] = task.time.split(':');
            let cronPattern: string;
            let scheduleDescription: string;

            // Create cron pattern based on frequency
            if (task.frequency === 'weekly' && task.dayOfWeek !== null && task.dayOfWeek !== undefined) {
                cronPattern = `${minute} ${hour} * * ${task.dayOfWeek}`;
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                scheduleDescription = `weekly on ${days[task.dayOfWeek]} at ${hour}:${minute}`;
            } else if (task.frequency === 'daily') {
                cronPattern = `${minute} ${hour} * * *`;
                scheduleDescription = `daily at ${hour}:${minute}`;
            } else {
                console.warn(`⚠️ Unsupported frequency for task ${task.id}: ${task.frequency}`);
                return;
            }

            // Schedule the job
            const scheduledJob = cron.schedule(cronPattern, async () => {
                console.log(`🕒 Running scheduled ${task.type} task (ID: ${task.id})`);
                try {
                    if (task.type === 'status') {
                        // Send status email for specific board
                        await this.sendSprintUpdate(task.rapidViewId);
                        console.log(`✅ Status email sent successfully for board ${task.rapidViewId}`);
                    } else if (task.type === 'reminder') {
                        // Send scheduled reminder (bypasses weekly state checks)
                        await this.weeklyReminderService.runScheduledReminders();
                        console.log(`✅ Scheduled reminder sent successfully`);
                    }
                } catch (error) {
                    console.error(`❌ Scheduled ${task.type} task failed (ID: ${task.id}):`, error);
                }
            });

            this.scheduledJobs.set(task.id, scheduledJob);
            console.log(`📅 Scheduled ${task.type} task ${scheduleDescription} (ID: ${task.id})`);
        });

        console.log(`✅ Successfully scheduled ${this.scheduledJobs.size} task(s)`);
    }

    public start(port: number = 3000): void {
        this.app.listen(port, () => {
            console.log(`🚀 JIRA Email Reminder Web Server running on http://localhost:${port}`);
            console.log(`📧 Manage sprint reminders via the web interface`);
            console.log(`🔧 API endpoints available at http://localhost:${port}/api/`);
        });
    }
}

// Start the server
const server = new WebServer();
const port = parseInt(process.env.PORT || '3000');
server.start(port); 