import type {
  NotificationTemplateVariables,
  TrialLifecycleNotification,
} from '../../application/types/notification.types.js';
import { TrialLifecycleStage } from '../../domain/policies/trialLifecycle.policy.js';

interface TrialLifecycleTemplate {
  subject: string;
  previewText: string;
  eyebrow: string;
  title: string;
  description: string;
  highlight: string;
  actionLabel: string;
  subscriptionAction: boolean;
}

const templates = {
  [TrialLifecycleStage.Welcome]: {
    subject: 'Seu próximo bom trato começa aqui!',
    previewText: 'Sua avaliação gratuita está ativa. Conheça os primeiros passos.',
    eyebrow: 'BEM-VINDO AO BOM TRATO',
    title: 'Seu negócio merece esse cuidado.',
    description:
      'Sua avaliação gratuita começou! Agora você pode organizar seus clientes, criar orçamentos profissionais, agendar serviços e acompanhar seus recebimentos em um só lugar.',
    highlight:
      'Comece cadastrando um cliente e criando seu primeiro orçamento. Pequenos passos já podem transformar sua rotina.',
    actionLabel: 'Começar a utilizar o Bom Trato',
    subscriptionAction: false,
  },
  [TrialLifecycleStage.FirstQuote]: {
    subject: 'Vamos criar seu primeiro orçamento?',
    previewText: 'Descubra uma forma mais organizada de apresentar seus serviços.',
    eyebrow: 'SEUS PRIMEIROS PASSOS',
    title: 'Uma boa proposta abre novas oportunidades.',
    description:
      'Com o Bom Trato, você pode criar um orçamento profissional, compartilhar com seu cliente e acompanhar a resposta sem perder informações pelo caminho.',
    highlight:
      'Quando um orçamento é aprovado, o Bom Trato pode preparar a ordem de serviço reaproveitando as informações do atendimento.',
    actionLabel: 'Acessar minha conta',
    subscriptionAction: false,
  },
  [TrialLifecycleStage.GettingStarted]: {
    subject: 'Aproveite ainda mais sua avaliação do Bom Trato',
    previewText: 'Conheça recursos que podem facilitar o dia a dia do seu negócio.',
    eyebrow: 'EXPLORE NOVAS POSSIBILIDADES',
    title: 'Enquanto você trabalha, o Bom Trato acompanha.',
    description:
      'Experimente o Piloto Automático para acompanhar orçamentos, lembrar clientes de serviços agendados, solicitar avaliações e enviar lembretes de pagamento.',
    highlight: 'Você também pode configurar sua vitrine profissional e apresentar seus serviços para novos clientes.',
    actionLabel: 'Explorar o Bom Trato',
    subscriptionAction: false,
  },
  [TrialLifecycleStage.ExpiringInThreeDays]: {
    subject: 'Sua avaliação do Bom Trato está chegando ao fim',
    previewText: 'Confira a data de encerramento e conheça as opções de assinatura.',
    eyebrow: 'SUA AVALIAÇÃO GRATUITA',
    title: 'Vamos continuar organizando seu negócio?',
    description:
      'Seu período de avaliação está nos últimos dias. Você pode consultar os planos disponíveis e escolher uma assinatura para continuar utilizando a plataforma.',
    highlight:
      'A avaliação não gera uma cobrança automática. A assinatura somente começa quando você confirma a contratação.',
    actionLabel: 'Conhecer os planos',
    subscriptionAction: true,
  },
  [TrialLifecycleStage.ExpiringTomorrow]: {
    subject: 'Sua avaliação do Bom Trato termina em breve',
    previewText: 'Confira quando seu acesso gratuito será encerrado.',
    eyebrow: 'AVISO DE ENCERRAMENTO',
    title: 'Seu período gratuito está terminando.',
    description:
      'Sua avaliação gratuita está chegando ao fim. Após o encerramento, será necessário possuir uma assinatura válida para continuar utilizando os recursos operacionais.',
    highlight:
      'Se você já iniciou uma contratação, acompanhe a confirmação do pagamento na plataforma antes de tentar novamente.',
    actionLabel: 'Consultar minha assinatura',
    subscriptionAction: true,
  },
  [TrialLifecycleStage.Expired]: {
    subject: 'Sua avaliação gratuita do Bom Trato terminou',
    previewText: 'Saiba como recuperar seu acesso à plataforma.',
    eyebrow: 'AVALIAÇÃO ENCERRADA',
    title: 'Seu negócio pode continuar com o Bom Trato.',
    description:
      'Seu período gratuito terminou. Você pode escolher uma assinatura para recuperar o acesso operacional e continuar organizando seus atendimentos.',
    highlight:
      'O encerramento da avaliação não exclui automaticamente seus dados nem gera uma cobrança automática. Caso tenha iniciado uma contratação, acompanhe sua confirmação.',
    actionLabel: 'Consultar os planos disponíveis',
    subscriptionAction: false,
  },
} satisfies Record<TrialLifecycleStage, TrialLifecycleTemplate>;

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function mapTrialLifecycleTemplate(
  content: TrialLifecycleNotification,
  frontendUrl: string,
): NotificationTemplateVariables {
  const template = templates[content.stage];

  const actionUrl = new URL('/onboarding', frontendUrl);

  actionUrl.searchParams.set('organizationId', content.organizationId);

  if (template.subscriptionAction) {
    actionUrl.searchParams.set('subscribe', '1');
  }

  return {
    SUBJECT: template.subject,
    PREVIEW_TEXT: template.previewText,
    EYEBROW: template.eyebrow,
    TITLE: template.title,
    DESCRIPTION: template.description,
    HIGHLIGHT: template.highlight,
    ACTION_LABEL: template.actionLabel,
    ACTION_URL: actionUrl.toString(),
    TRIAL_EXPIRES_AT: dateFormatter.format(new Date(content.trialExpiresAt)),
  };
}
