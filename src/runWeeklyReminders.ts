import WeeklyReminderService from './weeklyReminderService.js';

/**
 * Standalone runner for Weekly Reminder Service
 * This script can be run independently to send weekly reminder emails
 * to reviewers with "to review" status issues.
 * 
 * Usage:
 * npm run weekly-reminder
 * or
 * node build/runWeeklyReminders.js
 */

console.log('🎯 Starting Weekly Reminder Runner...');
console.log('📧 This service sends reminder emails to users with "to review" status issues');
console.log('⏰ Reminders are sent once every 7 days automatically');
console.log('');

async function main() {
    try {
        const reminderService = new WeeklyReminderService();
        await reminderService.runWeeklyReminders();
        
        console.log('');
        console.log('✅ Weekly reminder process completed!');
        console.log('💡 This service will automatically track when to send the next reminder');
        
    } catch (error) {
        console.error('❌ Failed to run weekly reminders:', error);
        process.exit(1);
    }
}

// Run the service
main().catch(console.error); 