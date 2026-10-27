# Machine Learning Fundamentals

## Chapter 1: Introduction to Machine Learning
Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data.
Rather than being explicitly programmed, these systems improve their performance through experience.

### Types of Machine Learning
- **Supervised Learning**: The algorithm learns from labeled training data
- **Unsupervised Learning**: The algorithm finds hidden patterns in unlabeled data  
- **Reinforcement Learning**: The agent learns by interacting with an environment

## Chapter 2: Linear Regression
Linear regression models the relationship between a dependent variable y and independent variables X.
The goal is to find the best-fit line: y = wx + b where w is the weight and b is the bias.

### Gradient Descent
The optimization algorithm updates parameters iteratively:
θ = θ - α · ∇J(θ)
where α is the learning rate and ∇J(θ) is the gradient of the cost function.

## Chapter 3: Decision Trees
Decision trees split the data into branches based on feature values.
They use metrics like Information Gain and Gini Impurity to determine the best splits.

## Chapter 4: Neural Networks
Neural networks consist of layers of interconnected nodes (neurons).
Each connection has a weight, and each neuron applies an activation function.
Backpropagation computes gradients using the chain rule to update weights.

## Chapter 5: Model Evaluation
Overfitting occurs when a model performs well on training data but poorly on test data.
Cross-validation (K-fold) helps estimate how well a model generalizes.
Common metrics: Accuracy, Precision, Recall, F1-Score, AUC-ROC.
