import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageShell } from '../../shared/page-shell/page-shell';

interface FaqItem {
  question: string;
  answer: string;
  open: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, FormsModule, PageShell],
  templateUrl: './help.html',
  styleUrl: './help.scss',
})
export class Help {
  faqs: FaqItem[] = [
    {
      question: 'How do I schedule a pickup?',
      answer:
        "Go to \"Schedule Pickup\" in the sidebar, choose a date, time window, and drop-off address, then confirm. You'll see it listed under your upcoming pickups on the Dashboard.",
      open: false,
    },
    {
      question: 'How do I join a recycling opportunity?',
      answer:
        'Open "Opportunities" from the sidebar, browse the list, and click into any opportunity that interests you to view details and apply.',
      open: false,
    },
    {
      question: 'How do I change my password?',
      answer:
        'Go to Settings > Account > Change Password, or open your Profile page and switch to the Password tab.',
      open: false,
    },
    {
      question: 'How do I turn on dark mode?',
      answer:
        'Click the Dark Mode toggle at the bottom of the sidebar, on the login page, or in Settings under Appearance. Your preference is saved on this device.',
      open: false,
    },
    {
      question: 'Who can I contact for account issues?',
      answer:
        'Use the contact form below, or email us directly - our support team typically responds within one business day.',
      open: false,
    },
  ];

  contactForm = {
    subject: '',
    message: '',
  };

  submitted = false;
  supportEmail = 'support@wastezero.org';

  toggleFaq(item: FaqItem): void {
    item.open = !item.open;
  }

  submitContactForm(): void {
    if (!this.contactForm.subject.trim() || !this.contactForm.message.trim()) {
      return;
    }

    // No dedicated backend endpoint exists for support tickets yet, so we
    // hand off to the user's email client with the message pre-filled.
    // This keeps the page genuinely functional rather than a dead-end form.
    const subject = encodeURIComponent(this.contactForm.subject);
    const body = encodeURIComponent(this.contactForm.message);
    window.location.href = `mailto:${this.supportEmail}?subject=${subject}&body=${body}`;

    this.submitted = true;
    setTimeout(() => (this.submitted = false), 4000);
    this.contactForm = { subject: '', message: '' };
  }
}
